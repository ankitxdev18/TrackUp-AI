import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.resolve(__dirname, "../src/db/migrations");
const destDir = path.resolve(__dirname, "../dist/db/migrations");

if (!fs.existsSync(srcDir)) {
  console.error(`Source migrations folder does not exist: ${srcDir}`);
  process.exit(1);
}

// Clean destination first to ensure repeated builds do not leave stale or orphaned files
if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true });
}

fs.mkdirSync(destDir, { recursive: true });
fs.cpSync(srcDir, destDir, { recursive: true });

console.log(`Successfully copied migration assets to ${destDir}`);
