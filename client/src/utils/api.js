import axios from 'axios';

/**
 * Single axios instance for the whole app.
 *
 * In production VITE_API_URL points at the Render backend. In development it is left
 * empty so requests hit Vite's /api proxy (see vite.config.js) — no CORS, no env file
 * needed to get started.
 */
const baseURL = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL,
  // Course generation involves a Gemini round-trip; the default 0 (no timeout) would
  // hang forever on a dropped connection, but 10s would kill legitimate requests.
  timeout: 120_000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Installs the Auth0 bearer-token interceptor. Called once from AuthTokenBridge after
 * the Auth0 SDK is ready, because getAccessTokenSilently only exists inside the
 * provider's React context.
 */
let tokenInterceptorId = null;

export function attachTokenProvider(getAccessToken) {
  if (tokenInterceptorId !== null) {
    api.interceptors.request.eject(tokenInterceptorId);
  }
  tokenInterceptorId = api.interceptors.request.use(async (config) => {
    try {
      const token = await getAccessToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch {
      // Not logged in, or silent refresh failed. Let the request go out unauthenticated
      // so the server produces the canonical 401 rather than guessing here.
    }
    return config;
  });
}

/** Normalises every failure into an Error with a message the UI can show verbatim. */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return Promise.reject(
        new ApiClientError('That took too long. The server may be waking up — please retry.', 408),
      );
    }
    if (!error.response) {
      return Promise.reject(
        new ApiClientError('Cannot reach the server. Check your connection and try again.', 0),
      );
    }
    const { status, data } = error.response;
    const message = data?.error?.message || defaultMessageForStatus(status);
    return Promise.reject(new ApiClientError(message, status, data?.error?.code, data?.error?.details));
  },
);

function defaultMessageForStatus(status) {
  switch (status) {
    case 401:
      return 'Your session expired. Please log in again.';
    case 404:
      return 'We could not find what you were looking for.';
    case 429:
      return 'You have hit the generation limit. Please wait a little while.';
    case 502:
    case 503:
      return 'The AI service is temporarily unavailable. Please try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export class ApiClientError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Fire-and-forget warm-up for Render's free-tier cold start (~50s otherwise). */
export function warmUpBackend() {
  api.get('/api/health').catch(() => {});
}

export default api;
