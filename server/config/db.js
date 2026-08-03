import mongoose from 'mongoose';
import { env } from './env.js';

let connectionPromise = null;

/**
 * Connect to MongoDB. Safe to call more than once — the promise is memoised so
 * concurrent callers (server bootstrap, seed script, tests) share one connection.
 */
export async function connectDb(uri = env.mongoUri) {
  if (!uri) throw new Error('MONGO_URI is not set — cannot connect to MongoDB.');
  if (connectionPromise) return connectionPromise;

  mongoose.set('strictQuery', true);

  connectionPromise = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 10_000,
      autoIndex: env.nodeEnv !== 'production',
    })
    .then((conn) => {
      console.log(`[db] connected to ${conn.connection.name}`);
      return conn;
    })
    .catch((err) => {
      connectionPromise = null;
      throw err;
    });

  return connectionPromise;
}

export async function disconnectDb() {
  connectionPromise = null;
  await mongoose.disconnect();
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}
