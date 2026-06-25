import type { FastifyInstance } from 'fastify';

/**
 * `POST /file-upload`
 *
 * Accepts a single MP3 file (multipart/form-data) and responds with the number
 * of MPEG-1 Layer III frames it contains:
 *
 *   { "frameCount": <number> }
 *
 * The upload is consumed as a stream and handed to the worker pool for parsing,
 * so the file is never buffered in memory or written to disk.
 */
export async function fileUploadRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/file-upload',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['frameCount'],
            properties: {
              frameCount: { type: 'integer', minimum: 0 },
            },
          },
          // Shared error shape for any 4xx/5xx response.
          '4xx': {
            type: 'object',
            required: ['error'],
            properties: { error: { type: 'string' } },
          },
          '5xx': {
            type: 'object',
            required: ['error'],
            properties: { error: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      // Streaming API: `upload.file` is a Readable; no temp file is created.
      const upload = await request.file();
      if (!upload) {
        return reply.code(400).send({ error: 'Expected a file in the multipart "file" field.' });
      }

      const frameCount = await app.parserPool.run(upload.file);
      return reply.send({ frameCount });
    },
  );
}
