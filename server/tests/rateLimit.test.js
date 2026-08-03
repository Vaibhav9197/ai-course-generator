import { describe, expect, it } from 'vitest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';
import { errorHandler } from '../middlewares/errorHandler.js';

/**
 * The application limiters skip themselves under NODE_ENV=test, because per-process
 * counters would leak between cases and make results depend on execution order.
 *
 * This builds an equivalent limiter with the same options and a limit of 2, so the
 * behaviour that matters — per-user keying and the shape of the 429 body — is still
 * verified rather than merely disabled.
 */
function appWithLimiter() {
  const app = express();
  app.use(express.json());

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 2,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.auth?.payload?.sub ?? req.ip,
    message: {
      error: { message: 'You can generate up to 2 courses per 1 minutes.', code: 'rate_limited' },
    },
  });

  // Stand-in for requireAuth: identity comes from a header so each test can pick a user.
  app.use((req, res, next) => {
    const sub = req.get('x-test-user');
    if (sub) req.auth = { payload: { sub } };
    next();
  });

  app.post('/generate', limiter, (req, res) => res.status(201).json({ ok: true }));
  app.use(errorHandler);

  return app;
}

describe('generation rate limiting', () => {
  it('allows requests up to the limit then returns 429', async () => {
    const app = appWithLimiter();

    for (let i = 0; i < 2; i += 1) {
      const res = await request(app).post('/generate').set('x-test-user', 'auth0|alice');
      expect(res.status).toBe(201);
    }

    const blocked = await request(app).post('/generate').set('x-test-user', 'auth0|alice');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('rate_limited');
  });

  it('counts per user, so one user cannot exhaust another user’s quota', async () => {
    const app = appWithLimiter();

    await request(app).post('/generate').set('x-test-user', 'auth0|alice');
    await request(app).post('/generate').set('x-test-user', 'auth0|alice');
    const aliceBlocked = await request(app).post('/generate').set('x-test-user', 'auth0|alice');
    expect(aliceBlocked.status).toBe(429);

    // Bob is unaffected — this is why the key is the JWT sub rather than the IP.
    const bob = await request(app).post('/generate').set('x-test-user', 'auth0|bob');
    expect(bob.status).toBe(201);
  });

  it('advertises the limit in standard headers', async () => {
    const app = appWithLimiter();

    const res = await request(app).post('/generate').set('x-test-user', 'auth0|carol');
    expect(res.headers).toHaveProperty('ratelimit');
  });
});
