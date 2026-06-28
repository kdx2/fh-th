import { buildApp } from './server/app.js';
import { config } from './config.js';

const SHUTDOWN_TIMEOUT_MS = 5000;

const app = await buildApp();

/** Close the server (draining in-flight requests), then exit with `code`. */
async function closeAndExit(code: number): Promise<void> {
  // Safety net: never hang forever waiting for connections to drain.
  setTimeout(() => process.exit(code), SHUTDOWN_TIMEOUT_MS).unref();
  try {
    await app.close();
  } catch (error) {
    app.log.error(error, 'error during shutdown');
  }
  process.exit(code);
}

// Graceful shutdown on Ctrl-C / container stop.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info(`received ${signal}, shutting down`);
    void closeAndExit(0);
  });
}

// Last-resort safety nets: log, then crash so the orchestrator restarts cleanly.
process.on('unhandledRejection', (reason) => {
  app.log.fatal({ reason }, 'unhandled promise rejection');
  void closeAndExit(1);
});
process.on('uncaughtException', (error) => {
  app.log.fatal(error, 'uncaught exception');
  void closeAndExit(1);
});

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
