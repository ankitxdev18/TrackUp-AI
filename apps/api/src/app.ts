import Fastify, { FastifyInstance } from "fastify";
import { checkDatabaseHealth } from "./db/index.js";

export interface BuildAppOptions {
  checkDbHealth?: () => Promise<{ ok: boolean }>;
  logger?: boolean;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger ?? true,
  });

  const checkDb = options.checkDbHealth ?? checkDatabaseHealth;

  server.get("/health", async (_request, reply) => {
    const health = await checkDb();

    if (!health.ok) {
      return reply.status(503).send({
        status: "degraded",
        db: "disconnected",
      });
    }

    return reply.status(200).send({
      status: "ok",
      db: "connected",
      timestamp: new Date().toISOString(),
    });
  });

  return server;
}
