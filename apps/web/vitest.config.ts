import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /.*[/\\]pages[/\\]lazyPages/,
        replacement: path.resolve(import.meta.dirname, "src/pages/syncPages.ts"),
      },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    testTimeout: 15000,
    pool: "threads",
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1,
      },
    },
  },
});


