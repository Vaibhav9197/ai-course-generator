/**
 * Auth0's public SPA configuration, read from the build-time environment.
 *
 * These three values are safe to expose — they identify the tenant and application, and
 * are visible in the login redirect URL anyway. Secrets never belong in a VITE_* var,
 * since every one of them is inlined into the public JavaScript bundle.
 *
 * Kept separate from AuthProvider.jsx so that file exports components only (Vite's fast
 * refresh cannot handle a module mixing components with other exports).
 */
export const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN;
export const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
export const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;

/**
 * True only when all three values are present.
 *
 * When false the app runs in unauthenticated development mode and the server attributes
 * requests to the seed user, so everything is usable before an Auth0 tenant exists. The
 * server refuses that fallback in production.
 */
export const isAuthEnabled = Boolean(auth0Domain && auth0ClientId && auth0Audience);
