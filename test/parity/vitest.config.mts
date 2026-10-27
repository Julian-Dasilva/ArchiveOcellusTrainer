import { defineConfig } from "vitest/config";
import { testWorkerOption } from "../workerCap.mjs";

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
    ...testWorkerOption(),
  },
});
