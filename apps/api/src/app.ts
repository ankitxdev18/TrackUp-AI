import Fastify, { FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
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
import { runSafeSessionCleanup } from "./auth/session.js";

export interface BuildAppOptions {
  checkDbHealth?: () => Promise<{ ok: boolean }>;
  logger?: boolean;
  corsOrigins?: string[];
  trustProxy?: boolean | string | string[] | ((address: string, hop: number) => boolean);
  rateLimit?: {
    globalMax?: number;
    globalWindowMs?: number;
    authMax?: number;
    authWindowMs?: number;
  };
  enableSessionCleanup?: boolean;
  sessionCleanupIntervalMs?: number;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const trustProxy = options.trustProxy ?? env.trustProxy;

  const server = Fastify({
    logger: options.logger ?? true,
    trustProxy,
  });

  const trustedOrigins = options.corsOrigins ?? env.corsOrigins;

  // 1. Rate limiting plugin — process-local in-memory store
  const isTest = env.NODE_ENV === "test";
  const authRateLimitMax =
    options.rateLimit?.authMax ?? (isTest ? 10000 : env.AUTH_RATE_LIMIT_MAX);
  const authRateLimitWindowMs =
    options.rateLimit?.authWindowMs ?? env.AUTH_RATE_LIMIT_WINDOW_MS;

  server.register(fastifyRateLimit, {
    global: false,
    errorResponseBuilder: (_request, _context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      code: "RATE_LIMITED",
      message: "Too many requests. Please try again later.",
    }),
  });

  // 2. CORS plugin — strict allowlist, credentials enabled, wildcard origins prohibited
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
      "X-TrackUp-Client",
    ],
    maxAge: 86400,
  });

  // 3. Cookie parser plugin
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

  server.register(authRoutes, {
    prefix: "/api/auth",
    authRateLimitMax,
    authRateLimitWindowMs,
  });
  server.register(calendarRoutes, { prefix: "/api/calendar/events" });
  server.register(goalRoutes, { prefix: "/api/goals" });
  server.register(habitRoutes, { prefix: "/api/habits" });
  server.register(ideasRoutes, { prefix: "/api/ideas" });
  server.register(journalRoutes, { prefix: "/api/journal" });
  server.register(projectRoutes, { prefix: "/api/projects" });
  server.register(taskRoutes, { prefix: "/api/tasks" });

  // 4. Periodic background session cleanup lifecycle
  if (options.enableSessionCleanup) {
    const intervalMs = options.sessionCleanupIntervalMs ?? 3600000; // default 1 hour
    const cleanupTimer = setInterval(async () => {
      try {
        const result = await runSafeSessionCleanup();
        if (result && result.deletedCount > 0) {
          server.log.info(
            { deletedCount: result.deletedCount },
            "Cleaned up expired sessions"
          );
        }
      } catch (err: unknown) {
        server.log.error(
          { error: err instanceof Error ? err.message : "Unknown error" },
          "Session cleanup failed"
        );
      }
    }, intervalMs);

    cleanupTimer.unref();

    server.addHook("onClose", async () => {
      clearInterval(cleanupTimer);
    });
  }

  return server;
}


