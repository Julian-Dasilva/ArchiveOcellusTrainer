import { defineConfig } from "vitest/config";
import { maxWorkers } from "../workerCap.mjs";

const workers = maxWorkers();

export default defineConfig({
  server: { fs: { strict: false } },
  test: {
    include: ["test/parity/fights.parity.ts"],
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost/" } },
    globals: true,
    setupFiles: ["./test/setupFiles.ts"],
    cache: false,
    testTimeout: 600000,
    ...(workers === undefined ? {} : { maxWorkers: workers }),
  },
});
