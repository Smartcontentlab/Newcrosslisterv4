// Runs the AI tests: node tests/run.mjs (or: pnpm --filter @workspace/api-server run test)
// No network and no real keys are used. NVIDIA, SoldComps and eBay are replaced by in-test mocks.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, ".out");
mkdirSync(out, { recursive: true });
const env = { ...process.env, NODE_ENV: "production", LOG_LEVEL: "silent", DATABASE_URL: "postgres://user:pass@127.0.0.1:5999/none" };
let failed = false;

// Library tests only touch src/lib, so third-party packages stay external and the output is ESM (top-level await).
await build({ entryPoints: [path.join(here, "ai-libs.test.ts")], bundle: true, platform: "node", format: "esm", packages: "external", outfile: path.join(out, "ai-libs.test.mjs"), logLevel: "error" });
// Route tests mount the real routers, which pull in workspace packages, so those are bundled and the output is CJS.
await build({ entryPoints: [path.join(here, "ai-routes.test.ts")], bundle: true, platform: "node", format: "cjs", outfile: path.join(out, "ai-routes.test.cjs"), logLevel: "error", external: ["pino", "pino-http", "pino-pretty", "express", "cookie-parser", "cors", "jose", "pg-native"] });

for (const file of ["ai-libs.test.mjs", "ai-routes.test.cjs"]) {
  const result = spawnSync("node", [path.join(out, file)], { env, stdio: "inherit" });
  if (result.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
