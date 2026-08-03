import { VideoCache, normalizeQuery } from '../models/index.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { runOnce } from '../utils/inFlight.js';

/**
 * Resolves a search query to an embeddable YouTube video.
 *
 * Quota, not latency, is the design constraint. The YouTube Data API grants 10,000 units
 * per day and `search.list` costs 100 units per call — about 100 searches per day in
 * total. A single 30-lesson course could exhaust the entire daily budget, so:
 *
 *   - every lookup is cache-first on a normalised query key
 *   - misses are cached too (videoId: null), so a query with no embeddable match doesn't
 *     re-spend 100 units on every page view
 *   - concurrent identical lookups share one call via runOnce
 *   - quota exhaustion resolves to null rather than throwing, and the UI degrades to a
 *     "Search on YouTube" link — a missing video must never block a lesson
 */

const SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
const REQUEST_TIMEOUT_MS = 8000;

export function isYoutubeConfigured() {
  return Boolean(env.youtube.apiKey);
}

/**
 * @returns {Promise<{ videoId: string|null, title?: string, channelTitle?: string, cached: boolean, reason?: string }>}
 */
export async function resolveVideo(rawQuery) {
  const query = String(rawQuery ?? '').trim();
  if (query.length < 2) {
    throw ApiError.badRequest('A video search query is required.');
  }

  const queryKey = normalizeQuery(query);

  const cached = await VideoCache.findOne({ queryKey });
  if (cached) {
    return {
      videoId: cached.videoId,
      title: cached.title,
      channelTitle: cached.channelTitle,
      cached: true,
    };
  }

  if (!isYoutubeConfigured()) {
    // Not an error: the app is fully usable without a YouTube key, videos just fall back
    // to a search link. Deliberately not cached, so enabling the key later takes effect.
    return { videoId: null, cached: false, reason: 'not_configured' };
  }

  return runOnce(`youtube:${queryKey}`, async () => {
    // Re-check: a concurrent request may have populated the cache while we queued.
    const raced = await VideoCache.findOne({ queryKey });
    if (raced) {
      return {
        videoId: raced.videoId,
        title: raced.title,
        channelTitle: raced.channelTitle,
        cached: true,
      };
    }

    const result = await search(query);

    // Cache genuine answers only — a hit, or a definitive "no results" (both worth 100
    // units not to repeat). Transient failures (quota exhausted, network error, HTTP 5xx)
    // set skipCache, because persisting them would permanently blank the video for a
    // query that will resolve fine once quota resets.
    if (!result.skipCache) {
      // upsert rather than create: two processes could reach here for the same key and
      // the unique index would reject the second.
      await VideoCache.updateOne(
        { queryKey },
        {
          $set: {
            queryKey,
            originalQuery: query,
            videoId: result.videoId,
            title: result.title,
            channelTitle: result.channelTitle,
            fetchedAt: new Date(),
          },
        },
        { upsert: true },
      ).catch((err) => {
        // A failed cache write must not fail the request — it only costs quota next time.
        console.warn('[youtube] cache write failed:', err.message);
      });
    }

    return { videoId: result.videoId, title: result.title, channelTitle: result.channelTitle, cached: false, reason: result.reason };
  });
}

async function search(query) {
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set('key', env.youtube.apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  // Only embeddable results are useful — the player is an iframe.
  url.searchParams.set('videoEmbeddable', 'true');
  url.searchParams.set('maxResults', '1');
  url.searchParams.set('safeSearch', 'moderate');
  url.searchParams.set('relevanceLanguage', 'en');

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    // Network failure or timeout. Return a miss so the lesson still renders; not cached,
    // so a transient blip doesn't poison the entry permanently.
    console.warn('[youtube] request failed:', err.message);
    return { videoId: null, reason: 'request_failed', skipCache: true };
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const reason = detail?.error?.errors?.[0]?.reason ?? `http_${response.status}`;

    if (reason === 'quotaExceeded' || response.status === 403) {
      console.warn('[youtube] quota exhausted — falling back to search links');
      return { videoId: null, reason: 'quota_exceeded', skipCache: true };
    }

    console.warn(`[youtube] search failed: ${response.status} ${reason}`);
    return { videoId: null, reason, skipCache: true };
  }

  const data = await response.json();
  const item = data.items?.[0];

  if (!item?.id?.videoId) {
    // A genuine "nothing matches" — worth caching so it isn't retried at 100 units a go.
    return { videoId: null, reason: 'no_results' };
  }

  return {
    videoId: item.id.videoId,
    title: item.snippet?.title,
    channelTitle: item.snippet?.channelTitle,
  };
}
