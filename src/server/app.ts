import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import multipartPlugin from '@fastify/multipart';
import { config } from '../config.js';
import { fileUploadRoutes } from './routes/fileUpload.js';

export interface BuildAppOptions {
  /** Max upload size in bytes before a 413. Defaults to {@link config.maxUploadBytes}. */
  maxUploadBytes?: number;
  /** Enable Fastify's logger. Defaults to true; tests pass `false` to stay quiet. */
  logger?: boolean;
}

/**
 * Build (but don't start) the Fastify application. Returning the instance keeps
 * it easy to test with `app.inject()` and to start from `index.ts`. Options are
 * injectable so tests can, e.g., set a tiny upload limit without touching env.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const { maxUploadBytes = config.maxUploadBytes, logger = true } = options;
  const app = Fastify({ logger });

  await app.register(multipartPlugin, {
    limits: {
      files: 1, // exactly one MP3 per request
      // Truncate the file stream at the cap; the route detects truncation → 413.
      fileSize: maxUploadBytes,
    },
  });

  // Single JSON error shape for every failure, with sensible status codes.
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) app.log.error(error);
    reply.code(statusCode).send({ error: error.message });
  });

  await app.register(fileUploadRoutes);

  return app;
}
