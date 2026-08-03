import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startMemoryDb, stopMemoryDb, clearCollections } from './helpers/memoryDb.js';
import { VideoCache, normalizeQuery } from '../models/index.js';
import { clearInFlight } from '../utils/inFlight.js';

/**
 * The behaviour under test here is quota discipline. `search.list` costs 100 of 10,000
 * daily units, so roughly 100 searches per day exist for the whole application — a single
 * course could consume all of them if lookups were not cached aggressively.
 */

let resolveVideo;
const originalFetch = globalThis.fetch;

function mockFetchOnce(payload, { status = 200 } = {}) {
  globalThis.fetch = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }));
  return globalThis.fetch;
}

const HIT = {
  items: [
    {
      id: { videoId: 'abc123' },
      snippet: { title: 'React Hooks Explained', channelTitle: 'Some Channel' },
    },
  ],
};

beforeAll(async () => {
  await startMemoryDb();
});

afterAll(async () => {
  await stopMemoryDb();
  globalThis.fetch = originalFetch;
});

beforeEach(async () => {
  vi.resetModules();
  clearInFlight();
  process.env.YOUTUBE_API_KEY = 'test-key';
  ({ resolveVideo } = await import('../services/youtube.service.js'));
});

afterEach(async () => {
  await clearCollections();
  globalThis.fetch = originalFetch;
  delete process.env.YOUTUBE_API_KEY;
  vi.restoreAllMocks();
});

describe('normalizeQuery', () => {
  it('collapses trivial variations so near-identical queries share a cache entry', () => {
    const canonical = normalizeQuery('React Hooks Explained');
    expect(normalizeQuery('react hooks explained')).toBe(canonical);
    expect(normalizeQuery('  React   Hooks,  Explained!  ')).toBe(canonical);
    expect(normalizeQuery('React "Hooks" Explained?')).toBe(canonical);
  });

  it('keeps genuinely different queries distinct', () => {
    expect(normalizeQuery('react hooks')).not.toBe(normalizeQuery('vue hooks'));
  });
});

describe('resolveVideo', () => {
  it('returns the first embeddable result and caches it', async () => {
    mockFetchOnce(HIT);

    const result = await resolveVideo('React Hooks Explained');

    expect(result.videoId).toBe('abc123');
    expect(result.title).toBe('React Hooks Explained');
    expect(result.cached).toBe(false);

    const stored = await VideoCache.findOne({ queryKey: normalizeQuery('React Hooks Explained') });
    expect(stored.videoId).toBe('abc123');
  });

  it('requests only embeddable videos', async () => {
    const fetchMock = mockFetchOnce(HIT);

    await resolveVideo('React Hooks');

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('videoEmbeddable')).toBe('true');
    expect(url.searchParams.get('type')).toBe('video');
    expect(url.searchParams.get('maxResults')).toBe('1');
  });

  it('serves a repeat lookup from cache without spending quota', async () => {
    const fetchMock = mockFetchOnce(HIT);

    await resolveVideo('React Hooks Explained');
    const second = await resolveVideo('React Hooks Explained');

    expect(second.videoId).toBe('abc123');
    expect(second.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats a differently-punctuated query as the same cache entry', async () => {
    const fetchMock = mockFetchOnce(HIT);

    await resolveVideo('React Hooks Explained');
    const variant = await resolveVideo('  react hooks, explained!  ');

    expect(variant.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('spends one call when two requests race for the same query', async () => {
    const fetchMock = mockFetchOnce(HIT);

    const [a, b] = await Promise.all([
      resolveVideo('React Hooks Explained'),
      resolveVideo('React Hooks Explained'),
    ]);

    expect(a.videoId).toBe('abc123');
    expect(b.videoId).toBe('abc123');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches a genuine no-results miss so it is not retried at 100 units a time', async () => {
    const fetchMock = mockFetchOnce({ items: [] });

    const first = await resolveVideo('a query with no matches whatsoever');
    expect(first.videoId).toBeNull();

    clearInFlight();
    const second = await resolveVideo('a query with no matches whatsoever');

    expect(second.videoId).toBeNull();
    expect(second.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache a quota-exceeded failure', async () => {
    mockFetchOnce(
      { error: { errors: [{ reason: 'quotaExceeded' }] } },
      { status: 403 },
    );

    const result = await resolveVideo('React Hooks Explained');

    expect(result.videoId).toBeNull();
    // Caching this would permanently blank a video that resolves fine once quota resets.
    const stored = await VideoCache.findOne({ queryKey: normalizeQuery('React Hooks Explained') });
    expect(stored).toBeNull();
  });

  it('does NOT cache a network failure', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('socket hang up');
    });

    const result = await resolveVideo('React Hooks Explained');

    expect(result.videoId).toBeNull();
    expect(await VideoCache.countDocuments()).toBe(0);
  });

  it('does NOT cache a server-side error', async () => {
    mockFetchOnce({ error: { errors: [{ reason: 'backendError' }] } }, { status: 500 });

    await resolveVideo('React Hooks Explained');
    expect(await VideoCache.countDocuments()).toBe(0);
  });

  it('returns a miss without calling the API when no key is configured', async () => {
    vi.resetModules();
    delete process.env.YOUTUBE_API_KEY;
    const unconfigured = await import('../services/youtube.service.js');
    const fetchMock = mockFetchOnce(HIT);

    const result = await unconfigured.resolveVideo('React Hooks Explained');

    expect(result.videoId).toBeNull();
    expect(result.reason).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
    // Not cached, so adding a key later takes effect immediately.
    expect(await VideoCache.countDocuments()).toBe(0);
  });

  it('rejects a query that is too short to be meaningful', async () => {
    await expect(resolveVideo('a')).rejects.toMatchObject({ status: 400 });
    await expect(resolveVideo('')).rejects.toMatchObject({ status: 400 });
  });
});
