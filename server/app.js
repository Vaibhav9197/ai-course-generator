import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';

import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { env, isTest } from './config/env.js';

/**
 * Builds the Express app without binding a port or touching the database, so
 * supertest can exercise routes in-process. Bootstrap lives in server.js.
 */
export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // Render terminates TLS upstream; needed for rate-limit keys.

  // crossOriginResourcePolicy is relaxed so the client can consume /audio responses.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression());

  app.use(
    cors({
      origin(origin, callback) {
        // Allow same-origin/tooling requests that send no Origin header (curl, health checks).
        if (!origin) return callback(null, true);
        if (env.clientOrigins.includes(origin)) return callback(null, true);
        // Vercel preview deployments get a generated subdomain per branch.
        if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return callback(null, true);
        return callback(new Error(`Origin not allowed by CORS: ${origin}`));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (!isTest) {
    app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
  }

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
