import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { env, assertRuntimeConfig } from './config/env.js';

async function bootstrap() {
  assertRuntimeConfig();

  if (env.mongoUri) {
    await connectDb();
  } else {
    console.warn('[db] MONGO_URI not set — starting without a database connection.');
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[server] listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    // Don't hang forever on stuck in-flight requests.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[server] failed to start:', err.message);
  process.exit(1);
});
