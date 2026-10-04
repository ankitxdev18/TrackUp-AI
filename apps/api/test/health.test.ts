import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { checkDatabaseHealth, closeDatabasePool, createDatabasePool } from "../src/db/index.js";

describe("Health Check & Database Connectivity", () => {
  afterAll(async () => {
    await closeDatabasePool();
  });

  it("verifies the live PostgreSQL database is reachable via SELECT 1", async () => {
    const health = await checkDatabaseHealth();
    expect(health.ok).toBe(true);
  });

  it("returns HTTP 200 with status ok and db connected when database is healthy", async () => {
    const app = buildApp({ logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
    expect(body.db).toBe("connected");
    expect(body.timestamp).toBeDefined();
    // Validate ISO timestamp format
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);

    await app.close();
  });

  it("returns HTTP 503 with degraded status when database is disconnected (mocked failure)", async () => {
    // Inject a mocked health checker simulating database outage
    const app = buildApp({
      logger: false,
      checkDbHealth: async () => ({ ok: false }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(503);

    const body = JSON.parse(response.body);
    expect(body).toEqual({
      status: "degraded",
      db: "disconnected",
    });

    // Ensure no stack traces or internal connection details are leaked
    expect(body.stack).toBeUndefined();
    expect(body.message).toBeUndefined();
    expect(response.body).not.toContain("password");
    expect(response.body).not.toContain("postgres://");

    await app.close();
  });

  it("isolated pool with invalid target port returns ok: false safely without crashing", async () => {
    // Create an isolated pool pointing to an unused port to test actual query error handling
    const unreachablePool = createDatabasePool("postgres://postgres@127.0.0.1:65530/TrackUp");
    try {
      const result = await checkDatabaseHealth(unreachablePool);
      expect(result.ok).toBe(false);
    } finally {
      await unreachablePool.end();
    }
  });
});
