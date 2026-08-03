import mongoose from 'mongoose';

/**
 * Registers a model idempotently.
 *
 * `mongoose.model(name, schema)` throws OverwriteModelError if the name is already
 * registered, which happens whenever the module graph is re-evaluated rather than the
 * process restarted — under `node --watch` in development, and under vi.resetModules() in
 * tests. Reusing the existing compiled model is always the right answer, because the
 * schema is a module-level constant and cannot have changed.
 */
export function registerModel(name, schema) {
  return mongoose.models[name] ?? mongoose.model(name, schema);
}

export default registerModel;
