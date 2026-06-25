import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import multipartPlugin from '@fastify/multipart';
import { config } from '../config.js';
import { fileUploadRoutes } from './routes/fileUpload.js';

/**
 * Build (but don't start) the Fastify application. Returning the instance keeps
 * it easy to test with `app.inject()` and to start from `index.ts`.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(multipartPlugin, {
    limits: {
      files: 1, // exactly one MP3 per request
      fileSize: config.maxUploadBytes, // enforce the size cap while streaming
    },
    throwFileSizeLimit: true, // turn an oversized upload into a 413 error
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
