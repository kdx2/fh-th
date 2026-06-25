import { availableParallelism } from 'node:os';

/** Read a positive integer from the environment, falling back to a default. */
function readIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name}: expected a positive integer, got "${raw}"`);
  }
  return value;
}

export const config = {
  host: process.env.HOST ?? '0.0.0.0',
  port: readIntFromEnv('PORT', 3000),

  /** Reject uploads larger than this many bytes (returns HTTP 413). */
  maxUploadBytes: readIntFromEnv('MAX_UPLOAD_BYTES', 100 * 1024 * 1024),

  /** Number of parser worker threads. Defaults to (CPU cores - 1), min 1. */
  workerPoolSize: readIntFromEnv('WORKER_POOL_SIZE', Math.max(1, availableParallelism() - 1)),
} as const;
