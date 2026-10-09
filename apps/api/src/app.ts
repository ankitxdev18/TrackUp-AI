import Fastify, { FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import { env } from "./config/env.js";
import { createCsrfProtection } from "./auth/csrf.js";
import { checkDatabaseHealth } from "./db/index.js";
import { authRoutes } from "./routes/auth.routes.js";
import { calendarRoutes } from "./routes/calendar.routes.js";
import { goalRoutes } from "./routes/goal.routes.js";
import { habitRoutes } from "./routes/habit.routes.js";
import { ideasRoutes } from "./routes/ideas.routes.js";
import { journalRoutes } from "./routes/journal.routes.js";
import { projectRoutes } from "./routes/project.routes.js";
import { taskRoutes } from "./routes/task.routes.js";

export interface BuildAppOptions {
  checkDbHealth?: () => Promise<{ ok: boolean }>;
  logger?: boolean;
  corsOrigins?: string[];
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const server = Fastify({
    logger: options.logger ?? true,
  });

  const trustedOrigins = options.corsOrigins ?? env.corsOrigins;

  // 1. CORS plugin — strict allowlist, credentials enabled, wildcard origins prohibited
  server.register(fastifyCors, {
    origin: trustedOrigins,
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Origin",
      "X-Requested-With",
      "x-dev-user-id",
    ],
    exposedHeaders: ["Set-Cookie"],
    maxAge: 86400,
  });

  // 2. Cookie parser plugin
  server.register(fastifyCookie, {
    secret: env.COOKIE_SECRET,
    parseOptions: {},
  });

  // 3. CSRF and Origin/Referer protection for state-changing requests
  server.addHook("preHandler", createCsrfProtection({ trustedOrigins }));

  server.addContentTypeParser(
    ["application/json", "text/plain"],
    { parseAs: "string" },
    (_req, body, done) => {
      if (!body || (typeof body === "string" && body.trim() === "")) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body as string));
      } catch (err: any) {
        err.statusCode = 400;
        done(err, undefined);
      }
    }
  );

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

  server.register(authRoutes, { prefix: "/api/auth" });
  server.register(calendarRoutes, { prefix: "/api/calendar/events" });
  server.register(goalRoutes, { prefix: "/api/goals" });
  server.register(habitRoutes, { prefix: "/api/habits" });
  server.register(ideasRoutes, { prefix: "/api/ideas" });
  server.register(journalRoutes, { prefix: "/api/journal" });
  server.register(projectRoutes, { prefix: "/api/projects" });
  server.register(taskRoutes, { prefix: "/api/tasks" });

  return server;
}

