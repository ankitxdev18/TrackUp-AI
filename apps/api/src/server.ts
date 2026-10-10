import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { closeDatabasePool } from "./db/index.js";

const server = buildApp({
  logger: env.NODE_ENV !== "test",
  enableSessionCleanup: env.NODE_ENV !== "test",
});

const start = async () => {
  try {
    await server.listen({
      port: env.PORT,
      host: env.HOST,
    });
    server.log.info(`TrackUp API running on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    server.log.error(err);
    await closeDatabasePool();
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  server.log.info(`Received ${signal}, shutting down gracefully...`);
  try {
    await server.close();
    await closeDatabasePool();
    process.exit(0);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start();
