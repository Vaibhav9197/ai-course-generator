/**
 * De-duplicates concurrent identical operations.
 *
 * Two problems this solves:
 *   - a double-clicked "Generate" button creating two identical courses
 *   - two browser tabs opening the same un-enriched lesson and both paying for generation
 *
 * Callers with the same key share one promise, so the work happens once and everyone gets
 * the same result.
 *
 * This is per-process, which is the right scope here: Render's free tier runs a single
 * instance. On a multi-instance deployment this would need to move to a Mongo or Redis
 * lock — noted rather than built, because it would be unused complexity today.
 */
const inFlight = new Map();

export function runOnce(key, work) {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => work())().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}

export function isInFlight(key) {
  return inFlight.has(key);
}

/** Test helper. */
export function clearInFlight() {
  inFlight.clear();
}
