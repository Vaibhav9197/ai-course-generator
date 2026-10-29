import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';
import { clearInFlight } from '../utils/inFlight.js';

/**
 * Route-level integration tests for the generation flow, with Gemini stubbed.
 *
 * These verify the behaviour that actually costs money if it is wrong: that a course is
 * generated once per request rather than once per click, that a lesson is generated once
 * per lifetime rather than once per view, and that a failure is recorded rather than
 * retried forever.
 */

const outlineMock = vi.fn();
const lessonMock = vi.fn();

vi.mock('../services/gemini.service.js', () => ({
  generateCourseOutline: (...args) => outlineMock(...args),
  generateLessonContent: (...args) => lessonMock(...args),
  isGeminiConfigured: () => true,
}));

const OUTLINE = {
  title: 'Introduction to Go',
  description: 'A practical introduction to Go.',
  tags: ['go', 'backend'],
  modules: [
    { title: 'Basics', lessons: ['Syntax', 'Types', 'Functions'] },
    { title: 'Concurrency', lessons: ['Goroutines', 'Channels', 'Select'] },
    { title: 'Tooling', lessons: ['Modules', 'Testing', 'Profiling'] },
  ],
};

const LESSON = {
  title: 'Syntax',
  objectives: ['Read Go syntax', 'Declare a variable', 'Write a main function'],
  content: [
    { type: 'heading', text: 'Syntax', level: 2 },
    { type: 'paragraph', text: 'Go has a deliberately small grammar.' },
    { type: 'code', language: 'go', text: 'package main\n\nfunc main() {}' },
    { type: 'video', query: 'go syntax basics' },
  ],
  resources: [
    { title: 'A Tour of Go', kind: 'course', query: 'A Tour of Go' },
    { title: 'Effective Go', kind: 'documentation', query: 'go.dev Effective Go' },
  ],
};

let app;

beforeAll(async () => {
  await startMemoryDb();
  const { createApp } = await import('../app.js');
  app = createApp();
});

afterAll(async () => {
  await stopMemoryDb();
});

beforeEach(() => {
  outlineMock.mockReset().mockResolvedValue(OUTLINE);
  lessonMock.mockReset().mockResolvedValue(LESSON);
  clearInFlight();
});

afterEach(async () => {
  await clearCollections();
});

/** Auth is unconfigured in tests, so requests are attributed to the dev identity. */
async function generateCourse(body = { topic: 'Learn Go' }) {
  const res = await request(app).post('/api/courses/generate').send(body);
  return res;
}

describe('POST /api/courses/generate', () => {
  it('persists the outline and returns the tree', async () => {
    const res = await generateCourse();

    expect(res.status).toBe(201);
    expect(res.body.course.title).toBe('Introduction to Go');
    expect(res.body.course.modules).toHaveLength(3);
    expect(outlineMock).toHaveBeenCalledTimes(1);
    expect(outlineMock).toHaveBeenCalledWith('Learn Go', expect.any(Object));
  });

  it('creates lessons as stubs, generating no lesson content up front', async () => {
    const res = await generateCourse();

    const lessons = res.body.course.modules.flatMap((mod) => mod.lessons);
    expect(lessons).toHaveLength(9);
    expect(lessons.every((lesson) => lesson.isEnriched === false)).toBe(true);
    // The whole point of two-stage generation: no lesson calls during outline creation.
    expect(lessonMock).not.toHaveBeenCalled();
  });

  it('creates one course when the same request arrives twice concurrently', async () => {
    const [first, second] = await Promise.all([generateCourse(), generateCourse()]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.course.id).toBe(second.body.course.id);
    // A double-clicked button must not bill the user twice.
    expect(outlineMock).toHaveBeenCalledTimes(1);
  });

  it('still generates separately for genuinely different topics', async () => {
    await Promise.all([
      generateCourse({ topic: 'Learn Go' }),
      generateCourse({ topic: 'Learn Rust' }),
    ]);

    expect(outlineMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a topic that is too short before calling the AI', async () => {
    const res = await generateCourse({ topic: 'a' });

    expect(res.status).toBe(400);
    expect(outlineMock).not.toHaveBeenCalled();
  });

  it('rejects an over-long topic', async () => {
    const res = await generateCourse({ topic: 'x'.repeat(400) });

    expect(res.status).toBe(400);
    expect(outlineMock).not.toHaveBeenCalled();
  });

  it('clamps out-of-range shape options instead of rejecting them', async () => {
    await generateCourse({ topic: 'Learn Go', moduleCount: 99, lessonsPerModule: 0 });

    const [, options] = outlineMock.mock.calls[0];
    expect(options.moduleCount).toBe(6);
    expect(options.lessonsPerModule).toBe(3);
  });

  it('surfaces an upstream AI failure without creating a course', async () => {
    outlineMock.mockRejectedValue(Object.assign(new Error('AI is down'), { status: 502 }));

    const res = await generateCourse();
    expect(res.status).toBe(502);

    const list = await request(app).get('/api/courses');
    expect(list.body.courses).toHaveLength(0);
  });
});

describe('GET lesson (enrich on read)', () => {
  async function courseId() {
    const res = await generateCourse();
    return res.body.course.id;
  }

  it('generates the lesson body on first view', async () => {
    const id = await courseId();

    const res = await request(app).get(`/api/courses/${id}/module/0/lesson/0`);

    expect(res.status).toBe(200);
    expect(res.body.lesson.isEnriched).toBe(true);
    expect(res.body.lesson.content).toHaveLength(4);
    expect(lessonMock).toHaveBeenCalledTimes(1);
  });

  it('persists the further-reading list and serves it from the cache', async () => {
    const id = await courseId();
    const url = `/api/courses/${id}/module/0/lesson/0`;

    await request(app).get(url);
    const cached = await request(app).get(url);

    expect(cached.body.lesson.resources).toEqual(LESSON.resources);
    expect(lessonMock).toHaveBeenCalledTimes(1);
  });

  it('serves the cached lesson on subsequent views with no further AI calls', async () => {
    const id = await courseId();

    await request(app).get(`/api/courses/${id}/module/0/lesson/0`);
    await request(app).get(`/api/courses/${id}/module/0/lesson/0`);
    const third = await request(app).get(`/api/courses/${id}/module/0/lesson/0`);

    expect(third.body.lesson.isEnriched).toBe(true);
    // Each lesson costs exactly one Gemini call for its whole lifetime.
    expect(lessonMock).toHaveBeenCalledTimes(1);
  });

  it('generates once when two tabs open the same lesson simultaneously', async () => {
    const id = await courseId();

    await Promise.all([
      request(app).get(`/api/courses/${id}/module/0/lesson/0`),
      request(app).get(`/api/courses/${id}/module/0/lesson/0`),
    ]);

    expect(lessonMock).toHaveBeenCalledTimes(1);
  });

  it('passes sibling lesson titles so the model does not stray into other lessons', async () => {
    const id = await courseId();

    await request(app).get(`/api/courses/${id}/module/1/lesson/0`);

    const [context] = lessonMock.mock.calls[0];
    expect(context.courseTitle).toBe('Introduction to Go');
    expect(context.moduleTitle).toBe('Concurrency');
    expect(context.lessonTitle).toBe('Goroutines');
    expect(context.siblingLessonTitles).toEqual(['Goroutines', 'Channels', 'Select']);
  });

  it('records the failure on the lesson and reports it, without marking it enriched', async () => {
    const id = await courseId();
    lessonMock.mockRejectedValue(Object.assign(new Error('model refused'), { status: 502 }));

    const failed = await request(app).get(`/api/courses/${id}/module/0/lesson/0`);
    expect(failed.status).toBe(502);

    // The tree still loads, and the stored error lets the UI explain and offer a retry.
    const tree = await request(app).get(`/api/courses/${id}`);
    const lesson = tree.body.course.modules[0].lessons[0];
    expect(lesson.isEnriched).toBe(false);
    expect(lesson.enrichError).toMatch(/model refused/);
  });

  it('clears a stored error once generation succeeds on retry', async () => {
    const id = await courseId();
    lessonMock.mockRejectedValueOnce(new Error('transient blip'));

    await request(app).get(`/api/courses/${id}/module/0/lesson/0`);
    clearInFlight();
    const second = await request(app).get(`/api/courses/${id}/module/0/lesson/0`);

    expect(second.status).toBe(200);
    expect(second.body.lesson.isEnriched).toBe(true);
    expect(second.body.lesson.enrichError).toBeUndefined();
  });

  it('404s on out-of-range indices without calling the AI', async () => {
    const id = await courseId();

    expect((await request(app).get(`/api/courses/${id}/module/99/lesson/0`)).status).toBe(404);
    expect((await request(app).get(`/api/courses/${id}/module/0/lesson/99`)).status).toBe(404);
    expect(lessonMock).not.toHaveBeenCalled();
  });

  it('returns breadcrumb context that crosses module boundaries', async () => {
    const id = await courseId();

    const res = await request(app).get(`/api/courses/${id}/module/0/lesson/2`);

    expect(res.body.context.position).toBe(3);
    expect(res.body.context.total).toBe(9);
    // Last lesson of module 0 -> first lesson of module 1.
    expect(res.body.context.next).toEqual({ moduleIndex: 1, lessonIndex: 0 });
  });
});

describe('POST /api/lessons/:id/regenerate', () => {
  it('regenerates an already-enriched lesson on request', async () => {
    const created = await generateCourse();
    const id = created.body.course.id;

    const first = await request(app).get(`/api/courses/${id}/module/0/lesson/0`);
    const lessonId = first.body.lesson.id;
    expect(lessonMock).toHaveBeenCalledTimes(1);

    clearInFlight();
    lessonMock.mockResolvedValue({
      ...LESSON,
      content: [...LESSON.content, { type: 'paragraph', text: 'a freshly written paragraph' }],
    });

    const res = await request(app).post(`/api/lessons/${lessonId}/regenerate`);

    expect(res.status).toBe(200);
    expect(res.body.lesson.content).toHaveLength(5);
    expect(lessonMock).toHaveBeenCalledTimes(2);
  });

  it('404s for a lesson id that does not exist', async () => {
    const res = await request(app).post('/api/lessons/aaaaaaaaaaaaaaaaaaaaaaaa/regenerate');
    expect(res.status).toBe(404);
  });
});
