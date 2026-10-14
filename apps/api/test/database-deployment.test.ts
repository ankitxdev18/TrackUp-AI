import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateEnv } from "../src/config/env.js";
import {
  getDatabasePoolConfig,
  sanitizeConnectionString,
} from "../src/db/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Phase 1B.3c: Database Security & Deployment Configuration", () => {
  describe("1. Database Connection String Redaction & Logging Safety", () => {
    it("redacts password in postgres:// URI", () => {
      const sanitized = sanitizeConnectionString(
        "postgres://trackup_admin:SuperSecretPassword123!@db.render.com:5432/trackup_prod"
      );
      expect(sanitized).toBe(
        "postgres://trackup_admin:******@db.render.com:5432/trackup_prod"
      );
      expect(sanitized).not.toContain("SuperSecretPassword123!");
    });

    it("redacts password in postgresql:// URI with query parameters", () => {
      const sanitized = sanitizeConnectionString(
        "postgresql://myuser:dbpass@postgres.internal:5432/trackup?sslmode=require"
      );
      expect(sanitized).toContain("myuser:******@postgres.internal:5432/trackup");
      expect(sanitized).not.toContain("dbpass");
    });

    it("handles connection URIs without passwords safely", () => {
      const sanitized = sanitizeConnectionString(
        "postgres://localhost:5432/trackup"
      );
      expect(sanitized).toBe("postgres://localhost:5432/trackup");
    });

    it("handles malformed URIs safely without throwing", () => {
      const sanitized = sanitizeConnectionString("not-a-valid-url");
      expect(sanitized).toBe("[INVALID_DATABASE_URL]");
    });
  });

  describe("2. Database Connection Security & TLS Policy", () => {
    it("enforces rejectUnauthorized: true when sslMode is enabled", () => {
      const config = getDatabasePoolConfig({
        connectionString: "postgres://user:pass@remote-db.example.com:5432/mydb",
        sslMode: true,
      });

      expect(config.ssl).toBeDefined();
      expect(typeof config.ssl).toBe("object");
      expect((config.ssl as any).rejectUnauthorized).toBe(true);
    });

    it("attaches custom CA certificate with rejectUnauthorized: true when provided", () => {
      const mockCa = "-----BEGIN CERTIFICATE-----\nMOCK_CA_CERT\n-----END CERTIFICATE-----";
      const config = getDatabasePoolConfig({
        connectionString: "postgres://user:pass@remote-db.example.com:5432/mydb",
        sslMode: true,
        sslCa: mockCa,
      });

      expect(config.ssl).toBeDefined();
      expect((config.ssl as any).rejectUnauthorized).toBe(true);
      expect((config.ssl as any).ca).toBe(mockCa);
    });

    it("never sets rejectUnauthorized: false under any circumstances", () => {
      const config = getDatabasePoolConfig({
        connectionString: "postgres://user:pass@remote-db.example.com:5432/mydb?sslmode=require",
      });

      expect(config.ssl).toBeDefined();
      expect((config.ssl as any).rejectUnauthorized).toBe(true);
      expect((config.ssl as any).rejectUnauthorized).not.toBe(false);
    });

    it("leaves local development unencrypted when sslMode is false or host is localhost", () => {
      const config = getDatabasePoolConfig({
        connectionString: "postgres://postgres@localhost:5432/TrackUp",
        sslMode: false,
      });

      expect(config.ssl).toBeUndefined();
    });

    it("detects ?sslmode=require in connection string and enables verified TLS", () => {
      const config = getDatabasePoolConfig({
        connectionString: "postgres://user:pass@render-db:5432/trackup?sslmode=require",
      });

      expect(config.ssl).toBeDefined();
      expect((config.ssl as any).rejectUnauthorized).toBe(true);
    });
  });

  describe("3. Environment Schema Database SSL Validation", () => {
    const baseEnv = {
      DATABASE_URL: "postgres://postgres@localhost:5432/TrackUp",
    };

    it("accepts valid DATABASE_SSL options ('true', 'false', 'require', 'verify-full')", () => {
      const envTrue = validateEnv({ ...baseEnv, DATABASE_SSL: "true" });
      expect(envTrue.DATABASE_SSL).toBe(true);

      const envReq = validateEnv({ ...baseEnv, DATABASE_SSL: "require" });
      expect(envReq.DATABASE_SSL).toBe(true);

      const envVerify = validateEnv({ ...baseEnv, DATABASE_SSL: "verify-full" });
      expect(envVerify.DATABASE_SSL).toBe(true);

      const envFalse = validateEnv({ ...baseEnv, DATABASE_SSL: "false" });
      expect(envFalse.DATABASE_SSL).toBe(false);
    });

    it("rejects insecure or unrecognized DATABASE_SSL values", () => {
      expect(() =>
        validateEnv({ ...baseEnv, DATABASE_SSL: "insecure" })
      ).toThrowError(/DATABASE_SSL/);

      expect(() =>
        validateEnv({ ...baseEnv, DATABASE_SSL: "allow" })
      ).toThrowError(/DATABASE_SSL/);
    });

    it("parses optional DATABASE_SSL_CA", () => {
      const envWithCa = validateEnv({
        ...baseEnv,
        DATABASE_SSL_CA: "MOCK_CA_CERTIFICATE",
      });
      expect(envWithCa.DATABASE_SSL_CA).toBe("MOCK_CA_CERTIFICATE");
    });
  });

  describe("4. Deployment Configuration Artifacts Verification", () => {
    it("verifies apps/web/vercel.json prioritizes /api/:path* proxy rewrite over SPA fallback", () => {
      const vercelConfigPath = path.resolve(__dirname, "../../web/vercel.json");
      expect(fs.existsSync(vercelConfigPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(vercelConfigPath, "utf8"));
      expect(content.rewrites).toBeDefined();
      expect(Array.isArray(content.rewrites)).toBe(true);
      expect(content.rewrites.length).toBeGreaterThanOrEqual(2);

      const apiRewriteIndex = content.rewrites.findIndex(
        (r: any) => r.source === "/api/:path*"
      );
      const spaFallbackIndex = content.rewrites.findIndex(
        (r: any) => r.source === "/(.*)" && r.destination === "/index.html"
      );

      // 1. API rewrite must exist
      expect(apiRewriteIndex).toBeGreaterThanOrEqual(0);
      const apiRewrite = content.rewrites[apiRewriteIndex];
      expect(apiRewrite.destination).toBe(
        "https://trackup-api.onrender.com/api/:path*"
      );

      // 2. SPA fallback must exist
      expect(spaFallbackIndex).toBeGreaterThanOrEqual(0);

      // 3. API rewrite must strictly precede SPA fallback to prevent /api/* routing to index.html
      expect(apiRewriteIndex).toBeLessThan(spaFallbackIndex);
    });

    it("verifies root render.yaml exists and configures web service, db, health check, and migrations", () => {
      const renderConfigPath = path.resolve(__dirname, "../../../render.yaml");
      expect(fs.existsSync(renderConfigPath)).toBe(true);

      const content = fs.readFileSync(renderConfigPath, "utf8");
      // Check service name and type
      expect(content).toContain("name: trackup-api");
      expect(content).toContain("type: web");
      // Check health check path
      expect(content).toContain("healthCheckPath: /health");
      // Check database wiring
      expect(content).toContain("name: trackup-db");
      // Check migration execution before server start
      expect(content).toContain("npm run db:migrate:api:prod");
      // Check TLS configuration
      expect(content).toContain("DATABASE_SSL");
    });

    it("verifies package.json scripts for compiled migration execution", () => {
      const apiPkgPath = path.resolve(__dirname, "../package.json");
      const rootPkgPath = path.resolve(__dirname, "../../../package.json");

      const apiPkg = JSON.parse(fs.readFileSync(apiPkgPath, "utf8"));
      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));

      expect(apiPkg.scripts["db:migrate:prod"]).toBe("node dist/db/migrate.js");
      expect(rootPkg.scripts["db:migrate:api:prod"]).toBe(
        "npm run db:migrate:prod --workspace=apps/api"
      );
    });
  });
});
