import { resolveVideo } from '../services/youtube.service.js';
import { asyncHandler } from '../utils/ApiError.js';

/**
 * GET /api/youtube/search?query=...
 *
 * Proxies YouTube lookups so the API key stays server-side. The brief suggested exposing
 * it as VITE_YOUTUBE_API_KEY, but every VITE_* value is inlined into the public bundle,
 * which would publish the key to anyone who loads the site.
 *
 * Always responds 200. A null videoId is a normal outcome (no match, quota exhausted, no
 * key configured) and the client renders a search link instead — a missing video should
 * never surface as an error on an otherwise complete lesson.
 */
export const searchVideo = asyncHandler(async (req, res) => {
  const result = await resolveVideo(req.query.query);

  // Cached results are immutable in practice, so let the browser hold them briefly and
  // avoid a round-trip when the user pages back to a lesson.
  if (result.videoId) {
    res.set('Cache-Control', 'private, max-age=3600');
  }

  res.json({
    videoId: result.videoId,
    title: result.title ?? null,
    channelTitle: result.channelTitle ?? null,
    ...(result.reason ? { reason: result.reason } : {}),
  });
});
