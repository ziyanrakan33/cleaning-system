import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * §IMP-10 — unit tests for pure logic (no database), distinct from the
 * scripts/test-*.ts integration scripts which hit a real Postgres instance.
 * These are meant to run in CI on every push with no external service.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
});
