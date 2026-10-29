import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

/**
 * The single-app Embarko package puts the built SPA beside the server. These tests cover
 * both shapes: with a built client the server serves it (and still answers the API), and
 * without one — Render — it stays a JSON-only API, exactly as before.
 */

const INDEX = '<!doctype html><html><body><div id="root"></div></body></html>';
let dir;

async function appWith(clientDir) {
  vi.resetModules();
  if (clientDir) process.env.CLIENT_DIST_DIR = clientDir;
  else delete process.env.CLIENT_DIST_DIR;
  const { createApp } = await import('../app.js');
  return createApp();
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttl-client-'));
  fs.writeFileSync(path.join(dir, 'index.html'), INDEX);
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'index-abc123.js'), 'console.log(1);');
});

afterAll(() => {
  delete process.env.CLIENT_DIST_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('with a built client present', () => {
  let app;
  beforeAll(async () => {
    app = await appWith(dir);
  });

  it('serves index.html at the root, uncached', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root">');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('serves index.html for deep links so the client router can take over', async () => {
    const res = await request(app).get('/courses/abc/module/0/lesson/1');

    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root">');
  });

  it('serves hashed assets with a long immutable cache', async () => {
    const res = await request(app).get('/assets/index-abc123.js');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('still answers the API, and unknown API paths stay JSON 404s', async () => {
    expect((await request(app).get('/api/health')).body.ok).toBe(true);

    const missing = await request(app).get('/api/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toContain('Route not found');
  });

  it('sends no Content-Security-Policy, matching how Vercel serves the same bundle', async () => {
    const res = await request(app).get('/');
    expect(res.headers['content-security-policy']).toBeUndefined();
  });
});

describe('without a built client (Render)', () => {
  let app;
  beforeAll(async () => {
    app = await appWith(path.join(dir, 'does-not-exist'));
  });

  it('stays a JSON-only API: the root is a JSON 404, not a page', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('Route not found');
  });

  it('keeps Helmet’s default Content-Security-Policy', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});

describe('CORS', () => {
  let app;
  beforeAll(async () => {
    app = await appWith(dir);
  });

  it('allows the SPA served by this same host, whose POSTs still carry an Origin', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Host', 'ai-course-generator.embarko.app')
      .set('Origin', 'https://ai-course-generator.embarko.app');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://ai-course-generator.embarko.app',
    );
  });

  it('still allows configured origins and Vercel deployments', async () => {
    for (const origin of ['http://localhost:5173', 'https://my-app-git-main.vercel.app']) {
      const res = await request(app).get('/api/health').set('Origin', origin);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
    }
  });

  it('rejects an unrelated origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.status).toBe(500);
  });
});
