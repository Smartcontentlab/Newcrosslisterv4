// Runs the app's pure-logic tests: node tests/run.mjs (or: pnpm --filter @workspace/resale-app run test)
// No browser, network or keys are used.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, ".out");
mkdirSync(out, { recursive: true });
let failed = false;
for (const name of ["bulk-import.test.ts"]) {
  const outfile = path.join(out, name.replace(/\.ts$/, ".mjs"));
  await build({ entryPoints: [path.join(here, name)], bundle: true, platform: "node", format: "esm", outfile, logLevel: "error" });
  const result = spawnSync("node", [outfile], { stdio: "inherit" });
  if (result.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
