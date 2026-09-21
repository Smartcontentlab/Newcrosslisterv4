import { build } from "esbuild";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundleDirectory = path.join(repoRoot, "serverless");
const staticSourceDirectory = path.join(repoRoot, "artifacts/resale-app/dist/public");
const staticOutputDirectory = path.join(repoRoot, "public");

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
await rm(staticOutputDirectory, { recursive: true, force: true });
await mkdir(bundleDirectory, { recursive: true });

await run("pnpm", ["--filter", "@workspace/resale-app", "run", "build"], {
  PORT: "4173",
  BASE_PATH: "/",
  NODE_ENV: "production",
});

await cp(staticSourceDirectory, staticOutputDirectory, { recursive: true });

// Package the unpacked Chrome extension so sellers can download it from Connections.
const extensionDirectory = path.join(repoRoot, "chrome-extension");
const extensionFiles = {};
for (const entry of await readdir(extensionDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name !== "README.md") {
    extensionFiles[`crosslinkos-extension/${entry.name}`] = new Uint8Array(await readFile(path.join(extensionDirectory, entry.name)));
  }
}
extensionFiles["crosslinkos-extension/README.md"] = new Uint8Array(await readFile(path.join(extensionDirectory, "README.md")));
await writeFile(path.join(staticOutputDirectory, "crosslinkos-extension.zip"), zipSync(extensionFiles));

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

console.log("Vercel static client and API bundle created.");
