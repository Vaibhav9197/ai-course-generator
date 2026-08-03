import rateLimit from 'express-rate-limit';
import { env, isTest } from '../config/env.js';

/**
 * Rate limiting for the endpoints that cost money.
 *
 * The deployed URL is public, and each generation is a paid Gemini call, so an unlimited
 * generate endpoint is an open invoice. Keyed on the authenticated user rather than IP:
 * IP is both too coarse (shared NAT, university networks) and too easy to rotate.
 */
export const generationLimiter = rateLimit({
  windowMs: env.limits.windowMinutes * 60 * 1000,
  limit: env.limits.generationsPerWindow,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Counters are per-process and would otherwise leak between test cases, making results
  // depend on execution order. The limiter's own behaviour is covered by rateLimit.test.js.
  skip: () => isTest,
  keyGenerator: (req) => req.auth?.payload?.sub ?? req.ip,
  message: {
    error: {
      message: `You can generate up to ${env.limits.generationsPerWindow} courses per ${env.limits.windowMinutes} minutes. Please try again later.`,
      code: 'rate_limited',
    },
  },
});

/**
 * A looser limit for lesson enrichment. Enrichment is per-lesson and cached forever, so
 * legitimate reading generates a burst of calls as someone works through a new course —
 * the ceiling only needs to stop a scripted sweep.
 */
export const enrichmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => isTest,
  keyGenerator: (req) => req.auth?.payload?.sub ?? req.ip,
  message: {
    error: {
      message: 'Too many lesson requests in a short period. Please slow down.',
      code: 'rate_limited',
    },
  },
});
