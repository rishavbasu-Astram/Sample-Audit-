# Implementation & Action Plan

How each feature is built (or should be built), the development method, and the tools
that make the work easier. This is the "action document" requested in the brief —
read it alongside [`FEATURES.md`](FEATURES.md) (what) and
[`ASTRAM_MIGRATION.md`](ASTRAM_MIGRATION.md) (how it lands in Astram).

---

## 1. Development method: contract-first

The codebase already follows a **contract-first** pipeline. Every feature flows in one
direction, which keeps the server and client permanently in sync:

```
openapi.yaml  ──Orval codegen──▶  api-zod (server validation)
 (source of                  └──▶  api-client-react (TanStack Query hooks)
  truth)
      │
      └──▶ Drizzle schema (lib/db) ──push──▶ MariaDB / MySQL
```

**The recipe to add or change any CRUD feature:**

1. **Model the data** — add/extend a table in `lib/db/src/schema/<module>.ts` (Drizzle, `mysql-core`). Run `pnpm --filter @workspace/db run push`.
2. **Define the contract** — add the paths and schemas in `lib/api-spec/openapi.yaml`, tagged by resource.
3. **Generate** — `pnpm --filter @workspace/api-spec run codegen` regenerates the Zod schemas (`lib/api-zod`) and React Query hooks (`lib/api-client-react`).
4. **Implement the route** — add a handler in `artifacts/api-server/src/routes/<module>.ts`, validating input with the generated Zod schema and parsing `numeric` columns with `parseFloat()` before serialising.
5. **Build the page** — add a page under `artifacts/financial-portal/src/pages/<module>/`, wire it into `App.tsx` (wouter `<Route>`) and the sidebar, and consume the generated hooks.
6. **Typecheck** — `pnpm run typecheck` across the workspace.

> **Why this matters:** because the OpenAPI spec drives both sides, you cannot ship a
> client that disagrees with the server contract — the types won't compile.

### Conventions to keep
- Numeric fields are MySQL `decimal` → arrive as `string` in Drizzle → `parseFloat()` in handlers (and `String(value)` on write).
- `lineItems` / `entries` arrays use a custom `json` type (LONGTEXT-backed on MariaDB; see `lib/db/src/json.ts`).
- Document numbers (`INV-`, `BILL-`, `QT-`, …) are auto-generated server-side at insert.
- Customer/vendor names are looked up and embedded in responses for convenience.
- Express 5: `req.params.id` is `string | string[]` — guard with `Array.isArray` before `parseInt`.
- No emojis in UI; information-dense, professional layout.

---

## 2. Built features — maintenance notes

All built modules already follow the recipe above. Ongoing work is mostly:

| Module | Likely next actions |
|--------|--------------------|
| Dashboard | Add drill-downs from KPI cards; cache heavy aggregates; date-range selector |
| Assets | Wire depreciation schedules to scheduled journal postings (see §4) |
| Sales (AR) | Harden Quote→Invoice→Receipt state machine; dunning for overdue invoices |
| Purchases (AP) | PO→Bill→Payment matching (3-way match); approval workflow |
| Banking | Statement import + auto-reconciliation (see §4) |
| Accountant | Finish **Bulk Updates** (brief lists it; verify journal bulk-edit coverage) |
| Controlling | Tag postings with `cost_center_id`; BOM-based standard-cost roll-up; more profitability dimensions (see §3) |

---

## 3. Controlling features — ✅ Built

The three management-accounting features (headline 6–8) now sit on top of the ledger.
Schema: `lib/db/src/schema/controlling.ts` · API: `artifacts/api-server/src/routes/controlling.ts`
· UI: `artifacts/financial-portal/src/pages/controlling/` · nav: sidebar "Controlling" section.

### 3.1 Cost Center Accounting — built
- **Data:** `cost_centers` table — code, name, manager, `parent_id` (hierarchy; bare int, no FK, matching the rest of the schema), `budgeted_amount`, `actual_amount`, `is_active`.
- **API:** `/cost-centers` CRUD. `variance` (= budgeted − actual) is computed server-side.
- **UI:** `pages/controlling/cost-centers.tsx` — DataTable with colour-coded variance + create/delete.
- **Next step (optional):** tag postings (journal/expense/bill/invoice lines) with `cost_center_id` and aggregate actuals automatically rather than storing them on the center.

### 3.2 Product Cost Controlling — built
- **Data:** `products` table — code, name, category, unit, `standard_cost`, `actual_cost`, `quantity`, `is_active`.
- **API:** `/products` CRUD. `unitVariance` (actual − standard) and `totalVariance` (× quantity) are computed server-side.
- **UI:** `pages/controlling/product-costs.tsx` — standard vs. actual variance table (overrun red, saving green).
- **Next step (optional):** bill-of-materials roll-up for standard cost; link actuals to purchase/expense postings per job.

### 3.3 Profitability Analysis (CO-PA style) — built
- **Data:** no new tables — derived from existing `invoices`, `bills`, `expenses`, `customers`.
- **API:** `/reports/profitability` returns `summary`, `byMonth` (trailing 6 months), and `byCustomer`.
- **Basis:** **accrual, ex-tax** — revenue = `invoices.subtotal`; cost = `bills.subtotal` + `expenses.amount`. Tax is excluded so VAT doesn't distort margin. This **intentionally differs** from the dashboard's cash-basis net profit (`paymentsReceived − expenses`).
- **UI:** `pages/controlling/profitability.tsx` — KPI cards, revenue-vs-cost Recharts bar chart, by-month and by-customer tables.
- **Next step (optional):** more dimensions (product, region, cost center), period selector, PDF/CSV export.

---

## 4. Cross-cutting technical work

- **Scheduled jobs** (recurring invoices/bills/expenses, depreciation postings): introduce a scheduler (`node-cron` or a queue like BullMQ + Redis) in the api-server to generate documents on schedule. Today the "recurring" entities exist as records but need a runner.
- **Bank reconciliation automation:** statement import (CSV/OFX/MT940) → matching engine (rule + fuzzy match on amount/date/reference) → reconcile UI. Consider a Plaid/TrueLayer-style aggregator only if live bank feeds are required.
- **Payment Links / Payments Received:** integrate a PSP (Stripe is the natural fit; a `stripe-replit-sync` dependency is already allow-listed) — create a checkout/payment-link, handle webhooks to mark payments received, reconcile to invoices.
- **PDF generation:** an `artifacts/api-server/src/routes/pdf.ts` route already exists — standardise invoice/quote/statement templates here.
- **Double-entry integrity:** enforce balanced journals (debits == credits) in Zod refinement + a DB check; respect Transaction Locking on posting dates.

---

## 5. Recommended tools

| Need | Tool | Why |
|------|------|-----|
| API contract & codegen | **OpenAPI 3.1 + Orval** (in place) | One source of truth → typed client + server validation |
| ORM / migrations | **Drizzle + drizzle-kit** (in place) | Type-safe schema; `push` for dev, generated SQL migrations for prod |
| Validation | **Zod** (in place) | Shared shapes between API and forms (`react-hook-form` + `zodResolver`) |
| Server data fetching | **TanStack Query** (in place) | Caching, invalidation, optimistic updates |
| UI | **shadcn/ui + Tailwind + Recharts** (in place) | Information-dense, accessible, consistent |
| Background jobs | **node-cron** (simple) or **BullMQ + Redis** (scale) | Recurring documents, depreciation, reconciliation |
| Payments | **Stripe** | Payment links, webhooks, reconciliation |
| Testing | **Vitest** (unit) + **Supertest** (API) + **Playwright** (E2E) | Cover the contract and critical flows |
| Bank feeds (optional) | **Plaid / TrueLayer** | Live transaction import for reconciliation |
| API docs | **Swagger UI / Redoc** off `openapi.yaml` | Free, always accurate to the contract |

---

## 6. Migration into Astram

The portal runs on its own MariaDB / MySQL database now and will be migrated into
Astram's production database later. The schema is deliberately modular
(`lib/db/src/schema/*`) to make that mapping explicit. See [`ASTRAM_MIGRATION.md`](ASTRAM_MIGRATION.md).
