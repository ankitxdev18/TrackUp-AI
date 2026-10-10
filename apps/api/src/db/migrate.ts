import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { env } from "../config/env.js";
import { closeDatabasePool, db, sanitizeConnectionString } from "./index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  const migrationsFolder = path.resolve(__dirname, "migrations");
  console.log(`Applying migrations from: ${migrationsFolder}`);
  console.log(`Database target: ${sanitizeConnectionString(env.DATABASE_URL)}`);
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied successfully.");
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("migrate.ts") ||
    process.argv[1].endsWith("migrate.js"));

if (isDirectRun) {
  runMigrations()
    .then(async () => {
      await closeDatabasePool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("Migration execution failed:", err);
      await closeDatabasePool();
      process.exit(1);
    });
}
