import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundleDirectory = path.join(repoRoot, "serverless");

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

await rm(bundleDirectory, { recursive: true, force: true });
await mkdir(bundleDirectory, { recursive: true });

await run("pnpm", ["--filter", "@workspace/resale-app", "run", "build"], {
  PORT: "4173",
  BASE_PATH: "/",
  NODE_ENV: "production",
});

await build({
  entryPoints: [path.join(repoRoot, "artifacts/api-server/src/app.ts")],
  outfile: path.join(bundleDirectory, "crosslinkos-api.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["pg-native"],
  sourcemap: false,
});

console.log("Vercel client and API bundle created.");
