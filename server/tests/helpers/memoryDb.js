import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Spins up an in-process MongoDB for tests, so the data layer is verifiable without an
 * Atlas cluster or any network access.
 */
let mongod = null;

export async function startMemoryDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'test' });
  return mongod.getUri();
}

export async function stopMemoryDb() {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

/** Wipes every collection between tests without paying to rebuild indexes. */
export async function clearCollections() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}
