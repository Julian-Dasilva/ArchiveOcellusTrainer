import { statSync } from "node:fs";

const file: string | undefined = process.argv[2];
if (file === undefined) throw new Error("usage: size.ts FILE");
process.exitCode = statSync(file).size === 0 ? 1 : 0;
