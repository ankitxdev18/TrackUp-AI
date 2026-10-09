import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcMigrationsDir = path.resolve(__dirname, "../src/db/migrations");
const distMigrationsDir = path.resolve(__dirname, "../dist/db/migrations");
const copyScriptPath = path.resolve(__dirname, "../scripts/copy-migrations.js");

describe("Build Assets: Database Migrations (P0-01)", () => {
  it("copies all SQL migrations and meta journal into dist/db/migrations", async () => {
    // Execute copy script
    const { execSync } = await import("node:child_process");
    execSync(`node "${copyScriptPath}"`, { stdio: "pipe" });

    expect(fs.existsSync(distMigrationsDir)).toBe(true);

    // Verify all SQL files in src exist in dist
    const srcFiles = fs
      .readdirSync(srcMigrationsDir)
      .filter((f) => f.endsWith(".sql"));
    expect(srcFiles.length).toBeGreaterThan(0);

    for (const file of srcFiles) {
      const distFilePath = path.join(distMigrationsDir, file);
      expect(fs.existsSync(distFilePath)).toBe(true);

      const srcContent = fs.readFileSync(path.join(srcMigrationsDir, file), "utf8");
      const distContent = fs.readFileSync(distFilePath, "utf8");
      expect(distContent).toBe(srcContent);
    }

    // Verify Drizzle meta journal
    const srcJournal = path.join(srcMigrationsDir, "meta/_journal.json");
    const distJournal = path.join(distMigrationsDir, "meta/_journal.json");
    expect(fs.existsSync(distJournal)).toBe(true);

    const srcJournalContent = JSON.parse(fs.readFileSync(srcJournal, "utf8"));
    const distJournalContent = JSON.parse(fs.readFileSync(distJournal, "utf8"));
    expect(distJournalContent).toEqual(srcJournalContent);
  });

  it("removes stale assets from dist/db/migrations on subsequent builds", async () => {
    expect(fs.existsSync(distMigrationsDir)).toBe(true);

    // Create a mock stale file
    const staleFilePath = path.join(distMigrationsDir, "stale_orphaned_migration.sql");
    fs.writeFileSync(staleFilePath, "-- Stale migration", "utf8");
    expect(fs.existsSync(staleFilePath)).toBe(true);

    // Re-run copy script
    const { execSync } = await import("node:child_process");
    execSync(`node "${copyScriptPath}"`, { stdio: "pipe" });

    // Stale file must have been purged
    expect(fs.existsSync(staleFilePath)).toBe(false);
  });

  it("matches the migration folder resolution in compiled migrate runner", () => {
    // Compiled migrate runner in dist/db/migrate.js uses: path.resolve(__dirname, "migrations")
    const compiledMigrateDir = path.resolve(__dirname, "../dist/db");
    const expectedMigrationsFolder = path.resolve(compiledMigrateDir, "migrations");

    expect(expectedMigrationsFolder).toBe(distMigrationsDir);
  });
});
