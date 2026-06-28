import type { FastifyInstance } from 'fastify';
import { countFramesInStream } from '../../mp3/countFramesInStream.js';

/** Errors that already carry an HTTP status (e.g. @fastify/multipart's 406). */
function hasStatusCode(error: unknown): error is { statusCode: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
  );
}

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
      let upload;
      try {
        upload = await request.file();
      } catch (error) {
        // Non-multipart content types throw with a statusCode (e.g. 406); a
        // malformed multipart body (e.g. a missing boundary) throws a busboy
        // error with none — that's the client's fault, so return 400, not 500.
        if (hasStatusCode(error)) throw error;
        return reply.code(400).send({ error: 'Malformed multipart/form-data request.' });
      }

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
