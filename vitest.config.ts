import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  test: { include: ["tests/*.test.ts"], fileParallelism: false, testTimeout: 30000,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://campora:campora@localhost:5432/campora_test" } },
});
