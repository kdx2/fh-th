import { buildApp } from './server/app.js';
import { config } from './config.js';

const app = await buildApp();

// Stop cleanly on Ctrl-C / container shutdown so workers are terminated.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info(`received ${signal}, shutting down`);
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
