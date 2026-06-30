#!/usr/bin/env node
/**
 * Cross-platform local launcher: builds + starts the API server and the Vite
 * frontend together, wiring the frontend's `/api` proxy to the local API.
 *
 *   node scripts/dev-local.mjs
 *
 * Prereqs (see docs/LOCAL_DEV.md): `pnpm install`, a running Postgres, schema
 * pushed (`pnpm --filter @workspace/db run push`), and data seeded
 * (`pnpm --filter @workspace/db run seed`).
 *
 * Env overrides:
 *   DATABASE_URL  Postgres connection string (default: local on :5433)
 *   API_PORT      API server port           (default: 8080)
 *   WEB_PORT      frontend port             (default: 5180)
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(root, "artifacts", "api-server");
const webDir = path.join(root, "artifacts", "financial-portal");

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres@localhost:5433/astram_finance";
const API_PORT = process.env.API_PORT ?? "8080";
const WEB_PORT = process.env.WEB_PORT ?? "5180";

const baseEnv = { ...process.env, DATABASE_URL, NODE_ENV: "development" };

console.log(`[dev-local] DATABASE_URL=${DATABASE_URL}`);
console.log(`[dev-local] building API server...`);
const build = spawnSync(process.execPath, ["build.mjs"], {
  cwd: apiDir,
  env: baseEnv,
  stdio: "inherit",
});
if (build.status !== 0) {
  console.error("[dev-local] API build failed.");
  process.exit(build.status ?? 1);
}

const children = [];
function start(name, command, args, opts) {
  const child = spawn(command, args, { stdio: "inherit", ...opts });
  child.on("exit", (code) => {
    console.log(`[dev-local] ${name} exited (${code}). Shutting down.`);
    shutdown();
  });
  children.push(child);
  return child;
}

function shutdown() {
  for (const c of children) {
    if (!c.killed) c.kill();
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`[dev-local] starting API on :${API_PORT}`);
start("api", process.execPath, ["--enable-source-maps", "dist/index.mjs"], {
  cwd: apiDir,
  env: { ...baseEnv, PORT: API_PORT },
});

console.log(`[dev-local] starting frontend on :${WEB_PORT}`);
start(
  "web",
  process.execPath,
  [
    path.join(webDir, "node_modules", "vite", "bin", "vite.js"),
    "--config",
    path.join(webDir, "vite.config.ts"),
    "--host",
    "127.0.0.1",
  ],
  {
    cwd: webDir,
    env: {
      ...baseEnv,
      PORT: WEB_PORT,
      BASE_PATH: "/",
      API_PROXY_TARGET: `http://localhost:${API_PORT}`,
    },
  },
);

console.log(`\n[dev-local] Frontend: http://localhost:${WEB_PORT}/   API: http://localhost:${API_PORT}/api\n`);
