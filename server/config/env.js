import dotenv from 'dotenv';

dotenv.config();

/**
 * Centralised, validated configuration.
 *
 * Model IDs are deliberately env-driven rather than hardcoded: Gemini model
 * identifiers churn quickly (TTS models are still preview-tagged), so pinning them
 * in source guarantees a future breakage. See README for how to confirm live IDs.
 */

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See server/.env.example.`,
    );
  }
  return value;
}

function optional(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '5000')),

  mongoUri: optional('MONGO_URI', ''),

  auth0: {
    issuerBaseUrl: optional('AUTH0_ISSUER_BASE_URL', ''),
    audience: optional('AUTH0_AUDIENCE', ''),
  },

  gemini: {
    apiKey: optional('GEMINI_API_KEY', ''),
    textModel: optional('GEMINI_TEXT_MODEL', 'gemini-2.5-flash'),
    ttsModel: optional('GEMINI_TTS_MODEL', 'gemini-2.5-flash-preview-tts'),
    ttsVoice: optional('GEMINI_TTS_VOICE', 'Kore'),
  },

  youtube: {
    apiKey: optional('YOUTUBE_API_KEY', ''),
  },

  /** Comma-separated list of allowed browser origins. */
  clientOrigins: optional('CLIENT_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  limits: {
    /** Max course generations per user per rolling window. */
    generationsPerWindow: Number(optional('RATE_LIMIT_GENERATIONS', '10')),
    windowMinutes: Number(optional('RATE_LIMIT_WINDOW_MINUTES', '60')),
  },
};

export const isProduction = env.nodeEnv === 'production';
export const isTest = env.nodeEnv === 'test';

/** True when auth is fully configured; lets local dev run before an Auth0 tenant exists. */
export const isAuthConfigured = Boolean(env.auth0.issuerBaseUrl && env.auth0.audience);

/**
 * Fail fast on genuinely non-optional config.
 *
 * Production demands everything. Development only warns, so the app can be run and the
 * scaffold verified before an Atlas cluster / Auth0 tenant / API keys exist — each
 * feature reports its own "not configured" state via /api/health instead.
 */
export function assertRuntimeConfig() {
  if (isProduction) {
    required('MONGO_URI');
    required('AUTH0_ISSUER_BASE_URL');
    required('AUTH0_AUDIENCE');
    required('GEMINI_API_KEY');
    return;
  }

  const missing = [
    ['MONGO_URI', env.mongoUri],
    ['AUTH0_ISSUER_BASE_URL', env.auth0.issuerBaseUrl],
    ['GEMINI_API_KEY', env.gemini.apiKey],
    ['YOUTUBE_API_KEY', env.youtube.apiKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length) {
    console.warn(
      `[config] not set: ${missing.join(', ')}. ` +
        'Features depending on them are disabled. See server/.env.example.',
    );
  }
}
