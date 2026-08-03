import { Router } from 'express';
import { isDbConnected } from '../config/db.js';
import { env, isAuthConfigured } from '../config/env.js';

const router = Router();

/**
 * Public liveness probe.
 *
 * The frontend also pings this on load to pre-warm Render's free-tier cold start
 * (~50s otherwise), so it must stay cheap and dependency-free.
 */
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    env: env.nodeEnv,
    services: {
      mongo: isDbConnected(),
      auth0: isAuthConfigured,
      gemini: Boolean(env.gemini.apiKey),
      youtube: Boolean(env.youtube.apiKey),
    },
  });
});

export default router;
