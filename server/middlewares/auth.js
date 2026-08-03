import { auth } from 'express-oauth2-jwt-bearer';
import { env, isAuthConfigured, isProduction } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { SEED_CREATOR } from '../fixtures/sampleCourse.js';

/**
 * Authentication.
 *
 * When Auth0 is configured, requests must carry a valid RS256 bearer token and identity
 * comes from the verified `sub` claim — we never call Auth0's /userinfo per request,
 * which would add a network hop and hit rate limits (see docs/ARCHITECTURE.md).
 *
 * When Auth0 is NOT configured (local development before a tenant exists) requests are
 * attributed to the seed user instead, so the whole app is usable end-to-end. This
 * fallback is hard-disabled in production.
 */

const verifyJwt = isAuthConfigured
  ? auth({
      audience: env.auth0.audience,
      issuerBaseURL: env.auth0.issuerBaseUrl,
      tokenSigningAlg: 'RS256',
    })
  : null;

function devFallback(req, res, next) {
  if (isProduction) {
    return next(
      ApiError.unauthorized(
        'Authentication is not configured on this server. Set AUTH0_ISSUER_BASE_URL and AUTH0_AUDIENCE.',
      ),
    );
  }
  req.auth = { payload: { sub: SEED_CREATOR } };
  req.isDevIdentity = true;
  return next();
}

/** Rejects unauthenticated requests. */
export const requireAuth = isAuthConfigured ? verifyJwt : devFallback;

/**
 * Attaches identity when a token is present but does not reject when it is absent.
 * Used by routes that behave differently for signed-in users but are still readable.
 */
export const optionalAuth = isAuthConfigured
  ? (req, res, next) => {
      if (!req.headers.authorization) return next();
      return verifyJwt(req, res, (err) => (err ? next() : next()));
    }
  : devFallback;

/**
 * The authenticated user's Auth0 `sub` — the ownership key for every course.
 * Throws rather than returning undefined so a missing requireAuth can never silently
 * widen a query to every user's data.
 */
export function currentUserSub(req) {
  const sub = req.auth?.payload?.sub;
  if (!sub) throw ApiError.unauthorized();
  return sub;
}

/** Claims available from the verified token, for the first-login user upsert. */
export function currentUserClaims(req) {
  const payload = req.auth?.payload ?? {};
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || payload.nickname,
    picture: payload.picture,
  };
}
