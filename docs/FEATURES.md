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
| 6 | Cost Center Accounting | 🔲 Planned | No schema, API, or UI yet |
| 7 | Product Cost Controlling | 🔲 Planned | No schema, API, or UI yet |
| 8 | Profitability Analysis | 🔲 Planned | No schema, API, or UI yet |
| 9 | Cash & Bank Reconciliation | ✅ Built | Banking module (`pages/banking`) |

**6 of 9 headline features are implemented.** The three controlling/analytics features
(6–8) are the primary scope for the next phase — see
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

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

---

## Planned features (next phase)

These appear in the headline vision but have **no schema, API path, or UI** in the
current codebase. They are the controlling/management-accounting layer that sits on
top of the ledger:

- **Cost Center Accounting** — allocate costs to organisational cost centers; report by center.
- **Product Cost Controlling** — track standard vs. actual product/job costs.
- **Profitability Analysis (CO-PA style)** — margin and profitability reporting by dimension (product, customer, region).

See [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) for the proposed approach.
