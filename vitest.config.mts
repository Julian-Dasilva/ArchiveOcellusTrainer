import { defineConfig } from "vitest/config";
import { testWorkerOption } from "./test/workerCap.mjs";

export default defineConfig({
  server: { fs: { strict: false } },
  test: {
    dir: "src",
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost/" } },
    globals: true,
    setupFiles: ["./test/setupFiles.ts"],
    taskTitleValueFormatTruncate: Infinity,
    cache: false,
    ...testWorkerOption(),
  },
});
