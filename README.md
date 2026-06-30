# Astram Financial Portal

A comprehensive financial management portal covering the full accounting lifecycle —
**assets, sales (AR), purchases (AP), banking, and accountant tools** — built as a
contract-first TypeScript monorepo.

This portal is being developed as a standalone system that will eventually be
**integrated into the existing Astram platform**. It begins with its own database
(modelling Astram's entities) and is designed for a later migration into Astram's
production database. See [`docs/ASTRAM_MIGRATION.md`](docs/ASTRAM_MIGRATION.md).

> Product aesthetic: professional, information-dense — *"Bloomberg meets modern SaaS."* No emojis in the UI.

---

## Modules

| Module | Status | Coverage |
|--------|--------|----------|
| **Dashboard & Unified Ledger** | ✅ Built | KPI cards (cash, receivables, payables, net profit), 6-month cash-flow chart, AR/AP aging, recent activity |
| **Assets** | ✅ Built | Asset registry with type/status management and depreciation tracking |
| **Sales (Accounts Receivable)** | ✅ Built | Customers · Quotes (convert-to-invoice) · Sales Orders · Invoices · Sales Receipts · Recurring Invoices · Payment Links · Payments Received · Credit Notes |
| **Purchases (Accounts Payable)** | ✅ Built | Vendors · Expenses · Recurring Expenses · Purchase Orders · Bills · Recurring Bills · Payments Made · Vendor Credits |
| **Banking & Reconciliation** | ✅ Built | Bank accounts with running balances, transaction ledger with credit/debit tracking |
| **Accountant** | ✅ Built | Chart of Accounts · Manual & Recurring Journals (double-entry) · Budgets (vs actual) · VAT Payments · Currency Adjustments · Transaction Locking |
| **Cost Center Accounting** | ✅ Built | Cost centers with manager, budgeted vs. actual, and variance |
| **Product Cost Controlling** | ✅ Built | Products with standard vs. actual cost and unit/total cost variance |
| **Profitability Analysis** | ✅ Built | Contribution margin by month and customer (accrual, ex-tax) |

Full feature breakdown and the "SAP Finance alternative" vision:
[`docs/FEATURES.md`](docs/FEATURES.md). Per-feature implementation plan with methods
and recommended tools: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

---

## Tech stack

- **Monorepo:** pnpm workspaces, Node.js 24, TypeScript 5.9
- **API:** Express 5 (port 8080, served at `/api`), Pino logging
- **Frontend:** React 19 + Vite, TanStack Query, `wouter` routing, shadcn/ui, Recharts
- **Database:** MariaDB / MySQL + Drizzle ORM (`mysql2`)
- **Validation:** Zod (`zod/v4`), `drizzle-zod`
- **API codegen:** Orval — the OpenAPI spec drives both server-side Zod schemas and client-side React Query hooks
- **Build:** esbuild (CJS bundle)

---

## Repository layout

```
.
├── lib/
│   ├── api-spec/            # OpenAPI contract (source of truth) + Orval config
│   ├── api-client-react/    # Generated TanStack Query hooks
│   ├── api-zod/             # Generated Zod validation schemas
│   └── db/                  # Drizzle table definitions (assets, sales, purchases, banking, accountant)
├── artifacts/
│   ├── api-server/          # Express route handlers
│   └── financial-portal/    # React + Vite frontend (pages, components, hooks)
├── scripts/                 # Workspace tooling
├── docs/                    # Project documentation (see below)
└── pnpm-workspace.yaml      # Workspace + dependency catalog
```

> **Note:** `artifacts/*` and `lib/*` are pnpm workspace roots declared in
> `pnpm-workspace.yaml`. Renaming these directories will break the workspace,
> typecheck filters, and TypeScript project references — keep the structure as-is.

---

## Quick start

**Prerequisites:** Node.js 24, [pnpm](https://pnpm.io/), and a MariaDB (or MySQL) database.

```bash
# 1. Install dependencies (pnpm is enforced; npm/yarn are blocked by preinstall)
pnpm install

# 2. Provide the database connection string
export DATABASE_URL="mysql://user:pass@localhost:3306/astram_finance"

# 3. Push the schema to your database (dev only)
pnpm --filter @workspace/db run push

# 4. (optional) Load demo data so the dashboard/charts are populated
pnpm --filter @workspace/db run seed

# 5. Run the API (port 8080) and the frontend (port 20844) in separate terminals
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/financial-portal run dev
```

**Running locally (Windows/macOS/Linux)?** See [`docs/LOCAL_DEV.md`](docs/LOCAL_DEV.md)
for a one-command launcher (`node scripts/dev-local.mjs`) that builds and starts the API
and frontend together with the dev proxy wired up.

### Other commands

| Command | Purpose |
|---------|---------|
| `pnpm run typecheck` | Full typecheck across all packages |
| `pnpm run build` | Typecheck + build all packages |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API hooks & Zod schemas from the OpenAPI spec |

### Contract-first workflow

1. Edit the contract in `lib/api-spec/openapi.yaml` (the single source of truth).
2. Run `pnpm --filter @workspace/api-spec run codegen` to regenerate the client hooks and Zod schemas.
3. After changing any file in `lib/db/src/schema/`, run `pnpm --filter @workspace/db run push`.

---

## Documentation

- [`docs/FEATURES.md`](docs/FEATURES.md) — full feature catalogue, built vs. planned, and the product vision
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — how each feature is/should be implemented, methods, and recommended tools
- [`docs/ASTRAM_MIGRATION.md`](docs/ASTRAM_MIGRATION.md) — strategy for migrating into the Astram database
- [`docs/LOCAL_DEV.md`](docs/LOCAL_DEV.md) — run the full stack locally on Windows/macOS/Linux
- [`docs/sources/`](docs/sources) — original brief and product notes this work is based on
- `replit.md` — environment/agent context for the Replit workspace this was scaffolded in

---

## Notes

- The database of record is **MariaDB / MySQL** (Drizzle `mysql2`, dialect `mysql`),
  consistent with `replit.nix` (MariaDB) and `.replit` (port `3306`).
- MariaDB exposes JSON columns as `LONGTEXT`, so JSON fields use a custom Drizzle type
  (`lib/db/src/json.ts`) that parses on read and serializes on write.
- MySQL has no `RETURNING`; create/update/delete handlers mutate, then `select` the row.

---

## License

[MIT](LICENSE)
