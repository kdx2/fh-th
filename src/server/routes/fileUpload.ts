import type { FastifyInstance } from 'fastify';
import { countFramesInStream } from '../../mp3/countFramesInStream.js';

/**
 * `POST /file-upload`
 *
 * Accepts a single MP3 file (multipart/form-data) and responds with the number
 * of MPEG-1 Layer III frames it contains:
 *
 *   { "frameCount": <number> }
 *
 * The upload is consumed as a stream and parsed incrementally, so the file is
 * never buffered in memory or written to disk.
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

      const tooLarge = () =>
        reply.code(413).send({ error: 'Uploaded file exceeds the maximum allowed size.' });

      try {
        const frameCount = await countFramesInStream(upload.file);
        // @fastify/multipart truncates (it does not throw) the file stream at the size limit
        if (upload.file.truncated) return tooLarge();
        return reply.send({ frameCount });
      } catch (error) {
        // A truncated upload may also surface as a parse error — prefer 413.
        if (upload.file.truncated) return tooLarge();
        throw error; // genuine 415/422/etc. → global error handler
      }
    },
  );
}
