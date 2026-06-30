# Astram Financial Portal

A comprehensive financial management portal for businesses, covering the full accounting lifecycle: assets, sales (AR), purchases (AP), banking, and accountant tools.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, served at `/api`)
- `pnpm --filter @workspace/financial-portal run dev` — run the React frontend (port 20844, served at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, port 8080
- Frontend: React + Vite, TanStack Query, wouter routing, shadcn/ui, Recharts
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/api-client-react/src/generated/` — generated TanStack Query hooks
- `lib/api-zod/src/generated/` — generated Zod validation schemas
- `lib/db/src/schema/` — Drizzle table definitions (assets.ts, sales.ts, purchases.ts, banking.ts, accountant.ts)
- `artifacts/api-server/src/routes/` — Express route handlers (dashboard, assets, sales, purchases, banking, accountant)
- `artifacts/financial-portal/src/pages/` — React page components
- `artifacts/financial-portal/src/components/` — Shared UI components

## Architecture decisions

- Contract-first API: OpenAPI spec drives both Zod validation on the server and React Query hooks on the client
- Numeric fields stored as Postgres `numeric` type; parsed to `float` in route handlers before serialization
- JSONB columns used for `lineItems` and `entries` arrays (invoices, bills, journals)
- Auto-generated document numbers (INV-, BILL-, QT-, etc.) on the server at insert time
- Customer/vendor names are looked up and embedded in responses for convenience

## Product

### Modules
- **Dashboard** — KPI cards (cash balance, receivables, payables, net profit), 6-month cash flow area chart, AR/AP aging breakdown, recent activity feed
- **Assets** — Asset registry with type/status management and depreciation tracking
- **Sales (AR)** — Customers, Quotes (with convert-to-invoice), Sales Orders, Invoices, Sales Receipts, Recurring Invoices, Payment Links, Payments Received, Credit Notes
- **Purchases (AP)** — Vendors, Expenses, Recurring Expenses, Purchase Orders, Bills, Recurring Bills, Payments Made, Vendor Credits
- **Banking** — Bank accounts with running balances, transaction ledger with credit/debit tracking
- **Accountant** — Chart of Accounts, Manual & Recurring Journals (double-entry), Budgets (vs actual), VAT Payments, Currency Adjustments, Transaction Locking

## User preferences

- No emojis in UI
- Professional, information-dense design — "Bloomberg meets modern SaaS" aesthetic
- Will eventually be migrated into the main Astram database

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`
- Always run `pnpm --filter @workspace/db run push` after changing any schema file in `lib/db/src/schema/`
- Numeric fields from DB are `string` type in Drizzle; parse with `parseFloat()` before sending in responses
- The API server proxies at `/api` — all routes are relative to that base (e.g., `/api/invoices`)
- `req.params.id` is `string | string[]` in Express 5 — always use the `Array.isArray` guard before `parseInt`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
