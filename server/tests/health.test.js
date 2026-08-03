import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

/**
 * createApp() deliberately does not touch the database, so route tests run in-process
 * with no Mongo instance. Feature tests that need persistence spin up
 * mongodb-memory-server themselves.
 */
describe('GET /api/health', () => {
  const app = createApp();

  it('reports ok and echoes which services are configured', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.services).toEqual({
      mongo: expect.any(Boolean),
      auth0: expect.any(Boolean),
      gemini: expect.any(Boolean),
      youtube: expect.any(Boolean),
    });
  });
});

describe('unmatched routes', () => {
  const app = createApp();

  it('returns the standard error envelope with a 404', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('Route not found');
  });
});
