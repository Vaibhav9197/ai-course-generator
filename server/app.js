import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';

import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { env, isTest } from './config/env.js';

/**
 * Where a built frontend may sit next to the server. Only the single-app Embarko package
 * puts one there (scripts/package-embarko.mjs); on Render the directory doesn't exist,
 * Vercel serves the frontend, and this server answers JSON only.
 */
const DEFAULT_CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

function resolveClientDir() {
  const dir = env.clientDistDir || DEFAULT_CLIENT_DIR;
  return fs.existsSync(path.join(dir, 'index.html')) ? dir : null;
}

/**
 * Builds the Express app without binding a port or touching the database, so
 * supertest can exercise routes in-process. Bootstrap lives in server.js.
 */
export function createApp() {
  const app = express();
  const clientDir = resolveClientDir();

  app.set('trust proxy', 1); // Render terminates TLS upstream; needed for rate-limit keys.

  app.use(
    helmet({
      // crossOriginResourcePolicy is relaxed so the client can consume /audio responses.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // When this server also serves the SPA, Helmet's default CSP would block the Auth0
      // domain, YouTube embeds and Chakra's injected styles. Vercel serves the same bundle
      // without a CSP, so this keeps the two deployments identical.
      ...(clientDir ? { contentSecurityPolicy: false } : {}),
    }),
  );
  app.use(compression());

  app.use(
    cors((req, callback) => {
      const origin = req.header('Origin');
      const allowed =
        // Same-origin/tooling requests that send no Origin header (curl, health checks).
        !origin ||
        // The SPA served by this same server: browsers still send Origin on POSTs.
        isSameOrigin(origin, req.get('host')) ||
        env.clientOrigins.includes(origin) ||
        // Vercel preview deployments get a generated subdomain per branch.
        /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);

      if (!allowed) return callback(new Error(`Origin not allowed by CORS: ${origin}`));
      return callback(null, { origin: true, credentials: true });
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (!isTest) {
    app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
  }

  app.use('/api', routes);

  if (clientDir) serveClient(app, clientDir);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * Serves the built SPA: hashed assets cached for a year, and index.html (never cached)
 * for every other non-API path, so deep links like /courses/:id load and React Router
 * takes over. Unknown /api paths still reach the JSON 404 handler.
 */
function serveClient(app, clientDir) {
  app.use(
    express.static(clientDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'), {
      headers: { 'Cache-Control': 'no-cache' },
    });
  });
}

function isSameOrigin(origin, host) {
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export default createApp;
