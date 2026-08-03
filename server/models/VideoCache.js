import mongoose from 'mongoose';
import { registerModel } from './registerModel.js';
import { serializePlugin } from './plugins/serialize.js';

/**
 * Cache of resolved YouTube lookups.
 *
 * This exists because quota, not latency, is the binding constraint: the YouTube Data API
 * grants 10,000 units/day and `search.list` costs 100 units — roughly 100 searches per
 * day in total. A single 30-lesson course could exhaust the entire daily budget, so every
 * lookup goes through here first and results are kept indefinitely.
 */
const videoCacheSchema = new mongoose.Schema(
  {
    /** Normalised query (see normalizeQuery) — the cache key. */
    queryKey: { type: String, required: true, unique: true, index: true },

    /** The query as the AI wrote it, kept for debugging prompt quality. */
    originalQuery: { type: String },

    /** Null when the search returned no embeddable result — a negative cache entry, so
     *  a query that genuinely has no match doesn't burn 100 units on every page view. */
    videoId: { type: String, default: null },

    title: { type: String },
    channelTitle: { type: String },

    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

videoCacheSchema.plugin(serializePlugin);

/**
 * Collapses trivial variations so near-identical queries share one cache entry.
 *
 * `\p{M}` is kept alongside letters and numbers because combining marks carry meaning in
 * many scripts — stripping them would merge genuinely different Devanagari queries into
 * one cache key and serve the wrong video.
 */
export function normalizeQuery(query) {
  return String(query || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const VideoCache = registerModel('VideoCache', videoCacheSchema);
export default VideoCache;
