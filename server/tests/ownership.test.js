import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';
import { clearInFlight } from '../utils/inFlight.js';

/**
 * Verifies that courses are isolated per user at the HTTP layer.
 *
 * The identity middleware is stubbed so each request can name its own user without
 * needing a live Auth0 tenant — which is exactly the seam requireAuth provides. What is
 * being tested is the authorisation logic in the controllers, not JWT verification (that
 * is express-oauth2-jwt-bearer's job and is covered by its own test suite).
 */

vi.mock('../middlewares/auth.js', async () => {
  const { ApiError } = await import('../utils/ApiError.js');
  return {
    requireAuth: (req, res, next) => {
      const sub = req.get('x-test-user');
      if (!sub) return next(ApiError.unauthorized());
      req.auth = { payload: { sub, email: `${sub}@example.com`, name: sub } };
      next();
    },
    optionalAuth: (req, res, next) => next(),
    currentUserSub: (req) => {
      const sub = req.auth?.payload?.sub;
      if (!sub) throw ApiError.unauthorized();
      return sub;
    },
    currentUserClaims: (req) => req.auth?.payload ?? {},
  };
});

const OUTLINE = {
  title: 'Shared Title',
  description: 'A course.',
  tags: ['x'],
  modules: [{ title: 'M1', lessons: ['L1', 'L2', 'L3'] }],
};

vi.mock('../services/gemini.service.js', () => ({
  generateCourseOutline: vi.fn(async () => OUTLINE),
  generateLessonContent: vi.fn(async () => ({
    title: 'L1',
    objectives: ['o1', 'o2', 'o3'],
    content: [
      { type: 'heading', text: 'H', level: 2 },
      { type: 'paragraph', text: 'Body text.' },
      { type: 'paragraph', text: 'More body text.' },
    ],
  })),
  isGeminiConfigured: () => true,
}));

const ALICE = 'auth0|alice';
const BOB = 'auth0|bob';

let app;

beforeAll(async () => {
  await startMemoryDb();
  const { createApp } = await import('../app.js');
  app = createApp();
});

afterAll(async () => {
  await stopMemoryDb();
});

beforeEach(() => clearInFlight());
afterEach(async () => clearCollections());

const as = (user) => ({
  get: (url) => request(app).get(url).set('x-test-user', user),
  post: (url, body) => request(app).post(url).set('x-test-user', user).send(body ?? {}),
  del: (url) => request(app).delete(url).set('x-test-user', user),
});

async function courseFor(user) {
  const res = await as(user).post('/api/courses/generate', { topic: 'A topic' });
  return res.body.course.id;
}

describe('unauthenticated access', () => {
  it('is rejected on every course route', async () => {
    for (const call of [
      request(app).get('/api/courses'),
      request(app).post('/api/courses/generate').send({ topic: 'x y z' }),
      request(app).get('/api/courses/aaaaaaaaaaaaaaaaaaaaaaaa'),
      request(app).get('/api/me'),
    ]) {
      const res = await call;
      expect(res.status).toBe(401);
    }
  });

  it('still allows the public health probe', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });
});

describe('course isolation between users', () => {
  it('lists only the requesting user’s courses', async () => {
    await courseFor(ALICE);
    await courseFor(ALICE);
    await courseFor(BOB);

    const alice = await as(ALICE).get('/api/courses');
    const bob = await as(BOB).get('/api/courses');

    expect(alice.body.courses).toHaveLength(2);
    expect(bob.body.courses).toHaveLength(1);
  });

  it('returns 404 — not 403 — for another user’s course', async () => {
    const id = await courseFor(ALICE);

    const res = await as(BOB).get(`/api/courses/${id}`);

    // 404 rather than 403 on purpose: a 403 would confirm the id exists, letting an
    // attacker enumerate valid course ids by comparing status codes.
    expect(res.status).toBe(404);
  });

  it('refuses to delete another user’s course', async () => {
    const id = await courseFor(ALICE);

    expect((await as(BOB).del(`/api/courses/${id}`)).status).toBe(404);
    // Alice's course must survive.
    expect((await as(ALICE).get(`/api/courses/${id}`)).status).toBe(200);
  });

  it('lets the owner delete their own course', async () => {
    const id = await courseFor(ALICE);

    expect((await as(ALICE).del(`/api/courses/${id}`)).status).toBe(204);
    expect((await as(ALICE).get(`/api/courses/${id}`)).status).toBe(404);
  });

  it('refuses to read a lesson inside another user’s course', async () => {
    const id = await courseFor(ALICE);

    const res = await as(BOB).get(`/api/courses/${id}/module/0/lesson/0`);
    expect(res.status).toBe(404);
  });

  it('refuses to regenerate a lesson inside another user’s course', async () => {
    const id = await courseFor(ALICE);
    const lesson = await as(ALICE).get(`/api/courses/${id}/module/0/lesson/0`);
    const lessonId = lesson.body.lesson.id;

    // Ownership lives on the course, so this has to be resolved lesson -> module -> course.
    expect((await as(BOB).post(`/api/lessons/${lessonId}/regenerate`)).status).toBe(404);
  });
});

describe('GET /api/me', () => {
  it('creates the profile row on first call and is idempotent after', async () => {
    const first = await as(ALICE).get('/api/me');
    expect(first.status).toBe(200);
    expect(first.body.user.email).toBe('auth0|alice@example.com');

    const second = await as(ALICE).get('/api/me');
    expect(second.body.user.id).toBe(first.body.user.id);
  });

  it('does not leak internal fields', async () => {
    const res = await as(ALICE).get('/api/me');

    expect(res.body.user).not.toHaveProperty('auth0Sub');
    expect(res.body.user).not.toHaveProperty('__v');
    expect(res.body.user).not.toHaveProperty('generationCount');
  });

  it('persists a preference change', async () => {
    await as(ALICE).get('/api/me');

    const patched = await request(app)
      .patch('/api/me')
      .set('x-test-user', ALICE)
      .send({ prefs: { autoTranslateToHinglish: true } });

    expect(patched.body.user.prefs.autoTranslateToHinglish).toBe(true);

    const reread = await as(ALICE).get('/api/me');
    expect(reread.body.user.prefs.autoTranslateToHinglish).toBe(true);
  });

  it('ignores unexpected fields in a preference update', async () => {
    await as(ALICE).get('/api/me');

    const res = await request(app)
      .patch('/api/me')
      .set('x-test-user', ALICE)
      .send({ prefs: { autoTranslateToHinglish: 'yes please' }, admin: true, generationCount: -5 });

    expect(res.status).toBe(200);
    // A non-boolean is not applied, and unknown keys never reach the document.
    expect(res.body.user.prefs.autoTranslateToHinglish).toBe(false);
    expect(res.body.user).not.toHaveProperty('admin');
  });
});
