# Feature Catalogue & Product Vision

The Astram Financial Portal aims to be a complete, in-house **alternative to SAP
Finance** — a real-time, double-entry financial system that plugs into the existing
Astram platform. It reuses Astram's existing database entities and is designed to be
migrated into Astram's production database at a later stage.

This document is the single reference for **what we are building** and **what is built
so far**. It reconciles two source inputs (preserved in [`sources/`](sources)):

- The handwritten vision note — framing the system as the "perfect alternative of SAP Finance" via **9 headline features**.
- `brief.txt` — the detailed, sub-feature-level breakdown of Sales, Purchases, Banking, and Accountant modules.

---

## The 9 headline features (vision)

From the handwritten note — *Financial System for ASTRAM, Financial Accounting (External Reporting)*.
The **General Ledger is the central brain**: every transaction across the company
automatically flows here to build the chart of accounts, balance sheet, and P&L.

| # | Headline feature | Status | Where it lives today |
|---|------------------|--------|----------------------|
| 1 | Real-Time Financial Dashboard & Unified Ledger | ✅ Built | `pages/dashboard.tsx`, `/dashboard/*` API |
| 2 | General Ledger Management | ✅ Built | Chart of Accounts + Journals (`pages/accountant/*`) |
| 3 | Accounts Payable | ✅ Built | Purchases module (`pages/purchases/*`) |
| 4 | Accounts Receivable | ✅ Built | Sales module (`pages/sales/*`) |
| 5 | Asset Management & Depreciation | ✅ Built | `pages/assets.tsx`, `assets` schema (`depreciationMethod`) |
| 6 | Cost Center Accounting | ✅ Built | `pages/controlling/cost-centers.tsx`, `/cost-centers` API |
| 7 | Product Cost Controlling | ✅ Built | `pages/controlling/product-costs.tsx`, `/products` API |
| 8 | Profitability Analysis | ✅ Built | `pages/controlling/profitability.tsx`, `/reports/profitability` API |
| 9 | Cash & Bank Reconciliation | ✅ Built | Banking module (`pages/banking`) |

**All 9 headline features are implemented.** The controlling/analytics layer (6–8) was
added on top of the ledger — see [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md). The
next phase is a tamper-evident **audit trail** (hash-chained ledger).

---

## Detailed feature breakdown (from `brief.txt`)

### Dashboard & Unified Ledger — ✅ Built
Real-time KPI cards (cash balance, receivables, payables, net profit), a 6-month
cash-flow area chart, AR/AP aging breakdowns, and a recent-activity feed.
API: `/dashboard/summary`, `/dashboard/cash-flow`, `/dashboard/recent-activity`,
`/dashboard/ar-aging`, `/dashboard/ap-aging`.

### Assets — ✅ Built
Asset registry pulled from / aligned to existing Astram system entities, with
type and status management and depreciation tracking.

### Sales — Accounts Receivable — ✅ Built
| Sub-feature | Built | Route |
|-------------|-------|-------|
| Customers | ✅ | `/sales/customers` |
| Quotes (convert-to-invoice) | ✅ | `/sales/quotes` |
| Sales Orders | ✅ | `/sales/sales-orders` |
| Invoices | ✅ | `/sales/invoices` |
| Sales Receipts | ✅ | `/sales/sales-receipts` |
| Recurring Invoices | ✅ | `/sales/recurring-invoices` |
| Payment Links | ✅ | `/sales/payment-links` |
| Payments Received | ✅ | `/sales/payments-received` |
| Credit Notes | ✅ | `/sales/credit-notes` |

### Purchases — Accounts Payable — ✅ Built
| Sub-feature | Built | Route |
|-------------|-------|-------|
| Vendors | ✅ | `/purchases/vendors` |
| Expenses | ✅ | `/purchases/expenses` |
| Recurring Expenses | ✅ | `/purchases/recurring-expenses` |
| Purchase Orders | ✅ | `/purchases/purchase-orders` |
| Bills | ✅ | `/purchases/bills` |
| Recurring Bills | ✅ | `/purchases/recurring-bills` |
| Payments Made | ✅ | `/purchases/payments-made` |
| Vendor Credits | ✅ | `/purchases/vendor-credits` |

### Banking — ✅ Built
All accounts visible with filters; bank accounts carry running balances and a
transaction ledger with credit/debit tracking. This module also delivers headline
feature #9 (Cash & Bank Reconciliation).

### Accountant — ✅ Built
| Sub-feature | Built | Route |
|-------------|-------|-------|
| Manual Journals | ✅ | `/accountant/journals` |
| Recurring Journals | ✅ | `/accountant/journals` (recurring type) |
| Chart of Accounts | ✅ | `/accountant/chart-of-accounts` |
| Budgets (vs actual) | ✅ | `/accountant/budgets` |
| VAT Payments | ✅ | `/accountant/vat-payments` |
| Currency Adjustments | ✅ | `/accountant/currency-adjustments` |
| Transaction Locking | ✅ | `/accountant/transaction-locking` |
| Bulk Updates | ⚠️ Partial | Listed in brief; verify coverage in journals/bulk flows |

### Controlling — ✅ Built
The management-accounting layer that sits on top of the ledger (headline features 6–8).

| Sub-feature | Built | Route |
|-------------|-------|-------|
| Cost Center Accounting | ✅ | `/controlling/cost-centers` |
| Product Cost Controlling | ✅ | `/controlling/product-costs` |
| Profitability Analysis | ✅ | `/controlling/profitability` |

- **Cost Center Accounting** — cost centers (code, name, manager, optional parent) with budgeted vs. actual amounts and server-computed variance.
- **Product Cost Controlling** — products/items with standard vs. actual unit cost; derives unit and total cost variance over produced quantity.
- **Profitability Analysis (CO-PA style)** — contribution margin by month and by customer. **Accrual basis, ex-tax** (revenue = `invoices.subtotal`; cost = `bills.subtotal` + `expenses.amount`); intentionally differs from the dashboard's cash-basis net profit.

Schema: `lib/db/src/schema/controlling.ts` · API: `artifacts/api-server/src/routes/controlling.ts` · UI: `artifacts/financial-portal/src/pages/controlling/`.

---

## Planned (next phase)

- **Audit trail** — a tamper-evident, append-only audit log where each row embeds the
  hash of the previous row (hash-chained table in MariaDB), giving verifiable history
  without the overhead of a distributed ledger. See `docs/sources/` (`audit.pdf`) for
  the blockchain framing this distils.
- **Bulk Updates** (Accountant) — verify/complete coverage in the journals bulk flows.

---

## Zoho-parity wave 1 (FABLE) — ✅ Built

Built per `docs/ZOHO_BOOKS_BLUEPRINT.md`, contract-first, all writes audit-anchored:

| Feature | Blueprint | Route |
|---------|-----------|-------|
| Items & basic inventory (goods/services, SKU, prices, tax link, stock + reorder alerts) | §5 | `/items` |
| Tax Rates (VAT/GST/sales tax/withholding, compound flag) | §6 | `/accountant/tax-rates` |
| Invoice lifecycle & payment application (draft→sent→partially_paid→paid, void, overpay/void-paid guards; payments create linked `payments_received` rows) | §1 | `/sales/invoices` actions |
| Bank fund transfers (double-entry: two ledger transactions + both balances updated) | §3 | Banking page → Transfer Funds |
| Financial reports: P&L (accrual, ex-tax, date range, by-customer/by-category, CSV export) + Trial Balance (debit/credit by account type, balance check) | §7 | `/reports/financial` |
| Recurring automation engine (profiles → scheduler mints draft invoices; run-now; pause/resume) | §8.3 | `/automation/recurring-profiles` |
| Payment reminders / dunning (offset/repeat rules, templated messages, dry-run preview, dispatch log) | §1/§8.4 | `/automation/payment-reminders` |

---

## Zoho-parity wave 2 (FABLE) — ✅ Built

| Feature | Blueprint | Route |
|---------|-----------|-------|
| Bank reconciliation (CSV statement import, deterministic auto-match on amount+type+±3-day window, manual match/unmatch, reconcile lock, per-account summary) | §3 | `/banking/reconciliation` |
| Inventory valuation & COGS (movement ledger: opening/purchase/sale/adjustment; weighted-average replay; auto-bootstrap of opening balances from seeded stock; overdraw + untracked-item guards; `items.stockOnHand` kept in sync) | §5 | `/inventory/valuation` |
| Webhooks event platform (register URLs with event filters `entity.ACTION` / `entity.*` / `*`; HMAC-SHA256 signed payloads; 5s timeout; delivery log with status/code/duration; test-fire; **every audited mutation fans out automatically** via the audit seam — zero per-route code) | §8 | `/automation/webhooks` |

Wave-2 design notes:
- Webhook events mirror the hash-chained audit ledger one-to-one, so external
  systems see exactly what the ledger records — better than Zoho's per-module
  webhook wiring.
- Reconciliation keeps a strict status machine per line
  (unmatched → matched → reconciled); reconciled lines are immutable.
- Valuation treats the movement ledger as the single source of truth; legacy
  seeded stock is folded in via an auto-generated opening movement on first use.
