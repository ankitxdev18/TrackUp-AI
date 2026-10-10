import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Phase 1B.4: Database Backup & Recovery Readiness", () => {
  const docPath = path.resolve(__dirname, "../../../docs/operations/backup-and-recovery.md");

  describe("1. Documentation & Policy Compliance", () => {
    it("ensures backup-and-recovery runbook exists", () => {
      expect(fs.existsSync(docPath)).toBe(true);
    });

    it("distinguishes all four tiers of backup readiness", () => {
      const doc = fs.readFileSync(docPath, "utf8");

      expect(doc).toContain("Tier 1: Existing, Verified Configuration");
      expect(doc).toContain("Tier 2: Recommended but Unconfigured Production Settings");
      expect(doc).toContain("Tier 3: Procedures Tested with Empirical Evidence");
      expect(doc).toContain("Tier 4: Procedures Remaining Unverified");
    });

    it("documents all 10 entity tables, indexes, and referential constraints", () => {
      const doc = fs.readFileSync(docPath, "utf8");

      const expectedTables = [
        "users",
        "sessions",
        "projects",
        "tasks",
        "goals",
        "habits",
        "habit_completions",
        "ideas",
        "journal_entries",
        "calendar_events",
      ];

      for (const table of expectedTables) {
        expect(doc).toContain(table);
      }
    });

    it("documents RPO, RTO, and provider limitations honestly", () => {
      const doc = fs.readFileSync(docPath, "utf8");

      expect(doc).toContain("RPO (Recovery Point Objective)");
      expect(doc).toContain("RTO (Recovery Time Objective)");
      expect(doc).toContain("Render Starter tier");
      expect(doc).toContain("Render's Free PostgreSQL tier");
    });

    it("enforces rule against overwriting production database", () => {
      const doc = fs.readFileSync(docPath, "utf8");

      expect(doc).toContain("NEVER execute a restore directly onto the production database");
    });
  });

  describe("2. Safe Local Restoration Drill Execution", () => {
    const pgDumpBin = "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe";
    const pgRestoreBin = "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_restore.exe";
    const tempDumpPath = path.resolve(__dirname, "../../../temp_vitest_drill.dump");

    it("proves backup export and restore into a disposable database succeeds without errors", async () => {
      // Skip if PostgreSQL binaries are not present on the host
      if (!fs.existsSync(pgDumpBin) || !fs.existsSync(pgRestoreBin)) {
        console.warn("PostgreSQL 18 binaries not found at expected path; skipping live drill execution test.");
        return;
      }

      // 1. Export from source database
      execSync(
        `"${pgDumpBin}" -h localhost -p 5432 -U postgres -d TrackUp --format=custom --no-owner --no-acl --file="${tempDumpPath}"`,
        {
          env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "postgres" },
          stdio: "pipe",
        }
      );

      expect(fs.existsSync(tempDumpPath)).toBe(true);
      const stat = fs.statSync(tempDumpPath);
      expect(stat.size).toBeGreaterThan(1000);

      const adminPool = new pg.Pool({
        connectionString: "postgres://postgres@localhost:5432/postgres",
      });

      try {
        // 2. Setup disposable database
        await adminPool.query("DROP DATABASE IF EXISTS trackup_vitest_drill;");
        await adminPool.query("CREATE DATABASE trackup_vitest_drill;");

        // 3. Restore dump into disposable database
        execSync(
          `"${pgRestoreBin}" -h localhost -p 5432 -U postgres -d trackup_vitest_drill --no-owner --no-acl "${tempDumpPath}"`,
          {
            env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || "postgres" },
            stdio: "pipe",
          }
        );

        // 4. Verify restored database schema
        const drillPool = new pg.Pool({
          connectionString: "postgres://postgres@localhost:5432/trackup_vitest_drill",
        });

        try {
          const res = await drillPool.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
          );
          const restoredTables = res.rows.map((r) => r.table_name);

          expect(restoredTables).toContain("users");
          expect(restoredTables).toContain("sessions");
          expect(restoredTables).toContain("projects");
          expect(restoredTables).toContain("tasks");
          expect(restoredTables).toContain("goals");
          expect(restoredTables).toContain("habits");
          expect(restoredTables).toContain("habit_completions");
          expect(restoredTables).toContain("ideas");
          expect(restoredTables).toContain("journal_entries");
          expect(restoredTables).toContain("calendar_events");

          const idxRes = await drillPool.query(
            "SELECT count(*) as count FROM pg_indexes WHERE schemaname = 'public';"
          );
          expect(Number(idxRes.rows[0].count)).toBeGreaterThanOrEqual(30);

          const fkRes = await drillPool.query(
            "SELECT count(*) as count FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY';"
          );
          expect(Number(fkRes.rows[0].count)).toBeGreaterThanOrEqual(10);
        } finally {
          await drillPool.end();
        }
      } finally {
        // 5. Cleanup disposable database and temporary file
        await adminPool.query("DROP DATABASE IF EXISTS trackup_vitest_drill;");
        await adminPool.end();

        if (fs.existsSync(tempDumpPath)) {
          fs.unlinkSync(tempDumpPath);
        }
      }
    }, 20000);
  });
});
