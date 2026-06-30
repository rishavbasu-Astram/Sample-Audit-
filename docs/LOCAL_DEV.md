# Local Development (Windows / macOS / Linux)

How to run the full stack — MariaDB + API + frontend — on your own machine.
The repo also runs on Replit as-is; this guide is for local development off-platform.

## Prerequisites

- **Node.js 24** and **pnpm** (`npm i -g pnpm`)
- **MariaDB** (or MySQL 8) running locally. Options:
  - Use an existing local MariaDB/MySQL, or
  - Docker: `docker run --name astram-mariadb -e MARIADB_ROOT_PASSWORD=root -p 3306:3306 -d mariadb:11`, or
  - Portable binaries (no admin) from [mariadb.org](https://mariadb.org/download/).

## 1. Install

```bash
pnpm install
```

The workspace installs the correct native build-tool binaries (esbuild, rollup,
lightningcss, tailwind-oxide) for your OS automatically — Windows, macOS, and Linux
are all supported.

## 2. Point at your database

Set `DATABASE_URL` to your MariaDB/MySQL instance, e.g.:

```bash
# macOS / Linux
export DATABASE_URL="mysql://root:root@localhost:3306/astram_finance"

# Windows (PowerShell)
$env:DATABASE_URL = "mysql://root:root@localhost:3306/astram_finance"
```

Create the database once if it doesn't exist (e.g. `mysql -u root -e "CREATE DATABASE astram_finance"`).

## 3. Push the schema and seed demo data

```bash
pnpm --filter @workspace/db run push     # create all tables
pnpm --filter @workspace/db run seed     # load demo data (safe to re-run)
```

The seed populates customers, invoices, bills, payments, expenses, bank accounts,
chart of accounts, assets, quotes, and POs so the dashboard, cash-flow chart, and
AR/AP aging views are all populated.

## 4. Run everything

**One command** (builds the API, starts API + frontend, wires the proxy):

```bash
node scripts/dev-local.mjs
```

Then open **http://localhost:5180/**. The API runs on `http://localhost:8080/api`.

Override ports/DB with env vars: `API_PORT`, `WEB_PORT`, `DATABASE_URL`.

### Or run the two servers manually

```bash
# API (port 8080)
cd artifacts/api-server && node build.mjs && PORT=8080 node --enable-source-maps dist/index.mjs

# Frontend (port 5180) — needs PORT, BASE_PATH, and the proxy target
cd artifacts/financial-portal && PORT=5180 BASE_PATH=/ API_PROXY_TARGET=http://localhost:8080 \
  node node_modules/vite/bin/vite.js --config vite.config.ts
```

## How the frontend reaches the API

The generated API client makes **relative** `/api/...` requests. In dev the Vite
server proxies `/api` to the API server (`vite.config.ts` → `server.proxy`, target
overridable via `API_PROXY_TARGET`). In production both are served behind one origin.

## Notes for contributors

- `lib/db/drizzle.config.ts` normalises the schema path to forward slashes so
  `drizzle-kit` works on Windows (its globber treats backslashes as escapes).
- If `pnpm run <script>` ever fails with a `preinstall` "Use pnpm instead" error from a
  nested dependency check, invoke the underlying binary directly (the launcher and the
  commands above already do this).
- `DATABASE_URL` is required by both `drizzle.config.ts` and the API server — they throw
  a clear error if it's unset.
