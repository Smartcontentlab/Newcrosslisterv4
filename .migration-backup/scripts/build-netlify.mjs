import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(repoRoot, "netlify-dist");

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(path.join(outputDir, "netlify/functions"), { recursive: true });

await run("pnpm", ["--filter", "@workspace/resale-app", "run", "build"], {
  PORT: "4173",
  BASE_PATH: "/",
  NODE_ENV: "production",
});
await cp(path.join(repoRoot, "artifacts/resale-app/dist/public"), outputDir, { recursive: true });
await cp(path.join(repoRoot, "netlify-upload.toml"), path.join(outputDir, "netlify.toml"));

await build({
  entryPoints: [path.join(repoRoot, "netlify/functions/api.mts")],
  outfile: path.join(outputDir, "netlify/functions/api.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: true,
  packages: "bundle",
  external: ["pg-native"],
});

console.log(`Netlify bundle created at ${outputDir}`);
