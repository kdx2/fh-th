import type { FastifyInstance } from 'fastify';

/**
 * `GET /health` — liveness/readiness probe.
 *
 * The service holds no external dependencies (no DB, no outbound calls), so a
 * 200 here means the process is up and the event loop is responsive — which
 * serves as both liveness and readiness. `logLevel: 'warn'` keeps routine probe
 * traffic out of the request logs.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      logLevel: 'warn',
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['status'],
            properties: { status: { type: 'string' } },
          },
        },
      },
    },
    async () => ({ status: 'ok' }),
  );
}
