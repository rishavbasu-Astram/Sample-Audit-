# 07. Reports & Dashboard

**Section of:** Zoho Books → Astram Financial Portal: Feature Blueprint  
**Stack:** OpenAPI 3.1 → Orval → TanStack Query + Zod | Drizzle (mysql2) | Express 5 | React 19 + Recharts + shadcn/ui  
**Last updated:** 2026-07-01

---

## Overview

Zoho Books ships **70+ built-in reports** across seven major categories. The Astram Financial Portal must replicate every category, go beyond Zoho on AI-assisted insight, real-time streaming KPIs, natural-language querying, anomaly detection, and a far superior drill-down UX. The tamper-evident audit ledger already in place gives Astram a compliance angle Zoho cannot match out of the box.

### Architecture principles

- **Contract-first:** every report endpoint defined in OpenAPI 3.1 before code is written; Orval generates typed hooks.
- **Heavy queries → MySQL views or materialized summary tables** refreshed on a cron or on transaction commit; light queries hit live tables.
- **Cash vs Accrual** is a first-class query param (`?basis=cash|accrual`) on every financial statement. Cash basis: revenue recognised when payment received, expense when payment made. Accrual: on invoice/bill date.
- **Comparative periods** (`?compare=prev_period|prev_year|custom&compare_start=&compare_end=`) on all statements.
- **Export** (PDF/XLSX/CSV) via a shared `/api/reports/export` POST that accepts a `reportKey` + filters; PDFs generated server-side with `puppeteer` or `@react-pdf/renderer`.
- **Scheduled delivery:** a `report_schedules` table stores cron expressions + recipient lists; a background worker renders + emails on schedule.
- **Drill-down:** every aggregate cell is a hyperlink that re-queries with tighter filters (e.g., click a customer's AR balance → filtered Invoice Details).

---

## Categorised Report Catalogue

| # | Category | Reports |
|---|----------|---------|
| A | **Dashboard** | KPI Summary, Cash-Flow Chart, AR Aging widget, AP Aging widget, Recent Activity, Top Customers, Cash Forecast widget |
| B | **Financial Statements** | Profit & Loss, Balance Sheet, Cash Flow Statement (direct + indirect), Trial Balance, General Ledger, Journal Report, Account Transactions, Movement of Equity |
| C | **Accounts Receivable** | AR Aging Summary, AR Aging Details, Customer Balance Summary, Customer Balance Details, Invoice Details, Retainer Invoice Details, Credit Note Details, Payments Received, Time to Get Paid, Refund History, Sales Order Details, Quote Details |
| D | **Sales** | Sales by Customer, Sales by Item, Sales by Salesperson, Sales Summary |
| E | **Accounts Payable** | AP Aging Summary, AP Aging Details, Vendor Balance Summary, Vendor Balance Details, Bill Details, Purchase Order Details, Prepaid Expenses |
| F | **Purchases** | Purchases by Vendor, Purchases by Item, Vendor Payments |
| G | **Tax** | Tax Summary, TDS Receivables Summary, TDS Payables Summary, (extensible: VAT/GST Detail) |
| H | **Inventory** | Inventory Summary, Inventory Valuation Summary, FIFO Cost Lot Tracking, ABC Classification, Product Sales |
| I | **Accountant** | Trial Balance, General Ledger, Account Transactions, Journal Report, Audit Trail |
| J | **Budget** | Budget vs Actuals (P&L), Budget vs Actuals (Balance Sheet), Budget vs Actuals (Cash Flow) |
| K | **Business Performance** | Business Performance Ratios, Cash Flow Forecast |
| L | **Custom** | Custom Report Builder, Saved Custom Reports |
| M | **Delivery** | Scheduled Reports, Report Snapshots / Period-Close Packs, Export (PDF/XLSX/CSV) |

---

## A. Dashboard

### A1. KPI Summary Cards

- **Purpose:** Single-screen heartbeat of cash, receivables, payables, revenue, expenses, net profit.
- **Zoho Books behaviour:** Dashboard shows total receivables, payables, and cash balance; no configurable KPI set.
- **Data model / query:** Live queries against `invoices`, `bills`, `payments_received`, `expenses`, `bank_accounts`. Already implemented in `artifacts/api-server/src/routes/dashboard.ts` (`GET /dashboard/summary`). Add `net_burn_rate` (rolling 30-day expenses) and `runway_days` (cash / daily_burn).
- **API (contract-first):**
  ```
  GET /api/dashboard/summary
  Response: { totalReceivable, totalPayable, cashBalance, overdueInvoices,
              overdueBills, totalRevenue, totalExpenses, netProfit,
              openQuotes, openPurchaseOrders, netBurnRate, runwayDays }
  ```
- **Rendering:** shadcn `Card` grid (4-col on desktop, 2-col tablet, 1-col mobile). Trend arrow vs prior 30 days. Colour-coded: green positive, amber warning (overdue > 0), red critical (runway < 30 days).
- **Automations:** KPI snapshot written to `kpi_snapshots(org_id, snapped_at, payload jsonb)` daily at midnight for trend history.
- **Personalized / better-than-Zoho:** Real-time SSE (`GET /api/dashboard/kpi-stream`) pushes delta updates when a payment lands. AI narrative card: "Revenue is up 18% vs last month, driven by 3 new enterprise invoices. Cash runway is 47 days — consider collecting INV-204." Anomaly flag if any KPI moves > 2σ from 90-day mean.
- **Build status:** **Partial** — core built; add `netBurnRate`, `runwayDays`, SSE stream, AI narrative, snapshot job.

---

### A2. Cash-Flow Chart (6-month)

- **Purpose:** Visual income vs expenses vs net by month for trailing 6 months.
- **Zoho Books behaviour:** Bar/line chart on dashboard; not configurable beyond date range.
- **Data model / query:** Already implemented (`GET /dashboard/cash-flow`). Queries `payments_received` and `expenses` grouped by month prefix. Extend to also include `bills` paid for more accurate cash-out; add 3-month forecast overlay using `recurring_invoices` / `recurring_bills` projections.
- **API (contract-first):**
  ```
  GET /api/dashboard/cash-flow?months=6&forecast=true
  Response: Array<{ period: string, income: number, expenses: number,
                    net: number, forecastIncome?: number, forecastExpenses?: number }>
  ```
- **Rendering:** Recharts `ComposedChart` — `Bar` for income/expenses, `Line` for net, dashed `Line` for forecast. Legend toggle. Responsive container.
- **Automations:** Cache result in Redis/memory for 5 min; invalidate on new payment/expense.
- **Personalized / better-than-Zoho:** Toggle between cash basis (actual payments) and accrual basis (invoice dates) without leaving the page. Click a bar → drill into transaction list for that month.
- **Build status:** **Partial** — core built; add forecast overlay, accrual toggle, drill-down.

---

### A3. AR Aging Widget

- **Purpose:** Stacked bar of outstanding receivables by aging bucket (Current, 1-30, 31-60, 61-90, 90+).
- **Zoho Books behaviour:** Summary card on dashboard.
- **Data model / query:** Already implemented (`GET /dashboard/ar-aging`). In-process bucketing loop over `invoices`. For scale: replace with SQL CASE bucketing:
  ```sql
  SELECT
    SUM(CASE WHEN DATEDIFF(CURDATE(), due_date) <= 0 THEN amount_due ELSE 0 END) AS current,
    SUM(CASE WHEN DATEDIFF(CURDATE(), due_date) BETWEEN 1 AND 30 THEN amount_due ELSE 0 END) AS d1_30,
    ...
  FROM invoices WHERE status NOT IN ('paid','cancelled') AND amount_due > 0;
  ```
- **API (contract-first):**
  ```
  GET /api/dashboard/ar-aging
  GET /api/reports/ar-aging-summary?as_of=YYYY-MM-DD&customer_id=&currency=
  ```
- **Rendering:** Recharts `BarChart` horizontal; colour scale green→red. Click bucket → AR Aging Details report pre-filtered.
- **Automations:** Nightly snapshot to `ar_aging_snapshots` for trend chart.
- **Personalized / better-than-Zoho:** AI flag: "INV-187 (₹42,000) is 47 days overdue — would you like to send a payment reminder?" One-click reminder send from widget.
- **Build status:** **Partial** — core built; add SQL-native bucketing, drill-down link, AI nudge.

---

### A4. AP Aging Widget

- **Purpose:** Mirror of AR Aging for bills payable.
- **Zoho Books behaviour:** Summary card on dashboard.
- **Data model / query:** Already implemented (`GET /dashboard/ap-aging`). Same SQL CASE upgrade as AR.
- **API (contract-first):** `GET /api/dashboard/ap-aging` / `GET /api/reports/ap-aging-summary`
- **Rendering:** Recharts `BarChart`; amber→red for past-due buckets.
- **Automations:** Nightly snapshot; alert if over-90 bucket crosses configurable threshold.
- **Personalized / better-than-Zoho:** "BILL-33 (₹18,500) is due in 3 days — approve payment now?" with deep link to bill.
- **Build status:** **Partial** — core built; same upgrades as AR.

---

### A5. Recent Activity Feed

- **Purpose:** Unified chronological timeline of invoices, bills, payments.
- **Zoho Books behaviour:** Simple list; no unified feed concept.
- **Data model / query:** Already implemented (`GET /dashboard/recent-activity`). Extend to include journal entries, credit notes, bank reconciliation events from audit ledger.
- **API (contract-first):**
  ```
  GET /api/dashboard/recent-activity?limit=20&types=invoice,bill,payment,journal,credit_note
  ```
- **Rendering:** shadcn timeline component with type icons, amount, status badge, deep link.
- **Automations:** SSE push for real-time updates.
- **Personalized / better-than-Zoho:** Grouped by day with natural language summaries: "Today: 2 invoices sent (₹86,000), 1 payment received (₹32,000)."
- **Build status:** **Partial** — core built; extend types, add SSE, AI day summaries.

---

### A6. Top Customers & Vendors Widget

- **Purpose:** Mini leaderboard of top 5 customers by revenue and top 5 vendors by spend in current month/quarter.
- **Zoho Books behaviour:** Not present on dashboard (only in Sales reports).
- **Data model / query:**
  ```sql
  -- Top customers (Drizzle)
  SELECT customer_id, SUM(total) as revenue FROM invoices
  WHERE invoice_date >= :start GROUP BY customer_id ORDER BY revenue DESC LIMIT 5;
  ```
- **API (contract-first):**
  ```
  GET /api/dashboard/top-customers?period=month|quarter|year
  GET /api/dashboard/top-vendors?period=month|quarter|year
  ```
- **Rendering:** shadcn ranked list with sparkline (Recharts `Sparkline`) of monthly trend.
- **Automations:** None required; query is fast.
- **Personalized / better-than-Zoho:** New feature not in Zoho dashboard. Click → Sales by Customer drilled to that customer.
- **Build status:** **New.**

---

### A7. Cash Forecast Widget

- **Purpose:** 30/60/90-day projected cash balance from recurring profiles + open invoices/bills.
- **Zoho Books behaviour:** Cash Flow Forecasting available on higher-tier plans; not on base dashboard.
- **Data model / query:** Combine (a) current cash balance from `bank_accounts`, (b) open invoice due amounts bucketed by due date, (c) open bill due amounts bucketed by due date, (d) recurring invoice/bill projections. Monte Carlo not needed at MVP.
- **API (contract-first):**
  ```
  GET /api/dashboard/cash-forecast?horizon=90
  Response: Array<{ date: string, projected_balance: number, inflow: number, outflow: number }>
  ```
- **Rendering:** Recharts `AreaChart` with confidence band (shaded area for low/high scenario). Reference line at zero.
- **Automations:** Recompute nightly; alert if projected balance goes negative within 30 days.
- **Personalized / better-than-Zoho:** Scenario sliders ("What if I collect 80% of AR in 30 days?"). AI narrative: "Cash goes negative around Aug 14 unless INV-201–203 are collected."
- **Build status:** **New.**

---

## B. Financial Statements

### B1. Profit & Loss (Income Statement)

- **Purpose:** Net income = Revenue − COGS − Operating Expenses ± Non-operating items for a period.
- **Zoho Books behaviour:** Sections: Operating Income, COGS, Gross Profit, Operating Expenses, Operating Income, Other Income/Expenses, Net Profit. Filters: date range, cash/accrual basis, account filter, compare prior period/year, compare by project or reporting tag. Supports multi-period columns.
- **Data model / query:** Aggregates `journal_entries` (or denormalized `invoice_line_items`, `bill_line_items`, `expense_line_items`) joined to `chart_of_accounts` on `account_type IN ('income','expense','cogs')`. For accrual: group by invoice/bill date. For cash: group by payment date. A `v_pl_accrual` and `v_pl_cash` MySQL view recommended for period-end heavy queries.
  ```sql
  -- Accrual P&L skeleton (view)
  SELECT coa.account_type, coa.account_name, coa.id AS account_id,
         SUM(jel.amount * jel.direction_multiplier) AS net_amount,
         DATE_FORMAT(je.entry_date, '%Y-%m') AS period
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.entry_date BETWEEN :start AND :end
    AND coa.account_type IN ('income','cogs','expense')
  GROUP BY coa.account_type, coa.account_name, coa.id, period;
  ```
- **API (contract-first):**
  ```
  GET /api/reports/profit-and-loss
  Query params:
    start_date      YYYY-MM-DD  (required)
    end_date        YYYY-MM-DD  (required)
    basis           cash|accrual  (default: accrual)
    compare         none|prev_period|prev_year|custom
    compare_start   YYYY-MM-DD
    compare_end     YYYY-MM-DD
    group_by        month|quarter|year
    account_ids     comma-separated account UUIDs
    tag_ids         comma-separated reporting tag IDs
  Response: ProfitAndLossReport (OpenAPI schema)
  ```
- **Rendering:** Hierarchical table (shadcn `Table` + collapsible rows): Revenue → COGS → Gross Profit → OpEx → Net. Comparison column with variance (amount + %). Export PDF/XLSX/CSV via shared export endpoint. Toggle between table and Recharts `BarChart` (stacked bars by period group).
- **Automations:** Period-close snapshot: on month-close trigger, snapshot P&L JSON to `report_snapshots(report_type, period, payload, hash)`. Hash is SHA-256 of payload, recorded in audit ledger for tamper evidence.
- **Personalized / better-than-Zoho:** (1) AI narrative auto-generated: "Gross margin compressed 4 pp vs prior year due to COGS spike in March — drill to see raw materials." (2) Natural-language query: "Show me P&L for Q1 with expenses broken by department." (3) Inline account click → Account Transactions drill-down.
- **Build status:** **New.**

---

### B2. Balance Sheet

- **Purpose:** Assets = Liabilities + Equity as of a point in time.
- **Zoho Books behaviour:** Sections: Current Assets, Non-Current Assets, Current Liabilities, Long-Term Liabilities, Equity. Filters: as-of date, cash/accrual, compare prior date, project filter.
- **Data model / query:** Sum of all `journal_entry_lines` by account where `entry_date <= :as_of`, grouped by `chart_of_accounts.account_type`. Running balance approach (debit-credit with normal balance direction per account type).
  ```sql
  SELECT coa.id, coa.account_name, coa.account_type, coa.sub_type,
         SUM(CASE WHEN jel.debit_credit = 'debit' THEN jel.amount ELSE -jel.amount END) AS balance
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.entry_date <= :as_of AND je.status = 'posted'
  GROUP BY coa.id;
  ```
- **API (contract-first):**
  ```
  GET /api/reports/balance-sheet
  Query params: as_of (YYYY-MM-DD), basis, compare_as_of, tag_ids, account_ids
  ```
- **Rendering:** Two-panel layout: Assets (left) / Liabilities+Equity (right). Collapsible sub-sections. Comparison column with delta. Export PDF/XLSX/CSV.
- **Automations:** Month-end snapshot + audit ledger hash.
- **Personalized / better-than-Zoho:** AI narrative: "Cash decreased ₹1.2M MoM; AR up ₹0.8M — collection lag is the driver." Click any account line → Account Transactions filtered to that account + date.
- **Build status:** **New.**

---

### B3. Cash Flow Statement

- **Purpose:** Classify cash movements into Operating / Investing / Financing activities.
- **Zoho Books behaviour:** Indirect method only (starts from net income, adjusts for non-cash items and working capital changes). Filters: date range, compare prior period.
- **Data model / query:**
  - **Indirect (default):** Net income from P&L query + adjustments for `depreciation`, change in AR (`invoices.amount_due` delta), change in AP (`bills.amount_due` delta), change in inventory.
  - **Direct (better-than-Zoho):** Aggregate actual cash receipts (`payments_received`) and payments (`vendor_payments`, `expense_payments`) by category.
  ```sql
  -- Direct method operating inflows
  SELECT SUM(amount) as operating_inflows FROM payments_received
  WHERE payment_date BETWEEN :start AND :end;
  -- Direct method operating outflows
  SELECT SUM(amount) as operating_outflows FROM vendor_payments
  WHERE payment_date BETWEEN :start AND :end;
  ```
- **API (contract-first):**
  ```
  GET /api/reports/cash-flow
  Query params: start_date, end_date, method (direct|indirect), compare, compare_start, compare_end
  ```
- **Rendering:** Three-section accordion (Operating / Investing / Financing) with subtotals and net change. Net change reconciles to `bank_accounts` balance delta. Recharts `AreaChart` of cumulative cash by day (drill-down chart). Export PDF/XLSX/CSV.
- **Automations:** Month-end snapshot.
- **Personalized / better-than-Zoho:** Both direct AND indirect method (Zoho only has indirect). Toggle between methods in-place. AI: "Operating cash burn is ₹3.1M vs ₹1.8M prior quarter — inventory build is the primary driver."
- **Build status:** **New.**

---

### B4. Trial Balance

- **Purpose:** Verify that total debits = total credits across all accounts for a period.
- **Zoho Books behaviour:** Lists all accounts with opening balance, period debits, period credits, closing balance. Compare prior period. Filters: date range, show/hide zero-balance accounts.
- **Data model / query:**
  ```sql
  SELECT coa.account_code, coa.account_name, coa.account_type,
         SUM(CASE WHEN je.entry_date < :start AND jel.debit_credit='debit' THEN jel.amount ELSE 0 END) AS opening_debit,
         SUM(CASE WHEN je.entry_date < :start AND jel.debit_credit='credit' THEN jel.amount ELSE 0 END) AS opening_credit,
         SUM(CASE WHEN je.entry_date BETWEEN :start AND :end AND jel.debit_credit='debit' THEN jel.amount ELSE 0 END) AS period_debit,
         SUM(CASE WHEN je.entry_date BETWEEN :start AND :end AND jel.debit_credit='credit' THEN jel.amount ELSE 0 END) AS period_credit
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.status = 'posted'
  GROUP BY coa.id;
  ```
- **API (contract-first):**
  ```
  GET /api/reports/trial-balance
  Query params: start_date, end_date, show_zero_balance (bool), compare, compare_start, compare_end
  ```
- **Rendering:** Flat table with column groups (Opening | Period Activity | Closing). Footer row showing debit/credit totals — must match. Warning banner if out of balance. Export PDF/XLSX/CSV.
- **Automations:** Run automatically on period-close; fail-safe: block period close if debits ≠ credits.
- **Personalized / better-than-Zoho:** Unbalanced-entry detector highlights the offending account in red. Click account → General Ledger for that account.
- **Build status:** **New.**

---

### B5. General Ledger

- **Purpose:** Complete transaction history for every account — the source of truth.
- **Zoho Books behaviour:** Lists every journal entry line for selected accounts/date range. Shows running balance. Filters: account, date range, transaction type. Can export with audit numbers.
- **Data model / query:** Direct query on `journal_entry_lines` JOIN `journal_entries` JOIN `chart_of_accounts`. Running balance computed with window function:
  ```sql
  SELECT jel.id, je.entry_date, je.reference, jel.description,
         jel.debit_credit, jel.amount,
         SUM(CASE WHEN jel.debit_credit='debit' THEN jel.amount ELSE -jel.amount END)
           OVER (PARTITION BY jel.account_id ORDER BY je.entry_date, je.id) AS running_balance
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE jel.account_id = :account_id AND je.entry_date BETWEEN :start AND :end
  ORDER BY je.entry_date, je.id;
  ```
  For large orgs, consider a `gl_summary` materialized view refreshed nightly.
- **API (contract-first):**
  ```
  GET /api/reports/general-ledger
  Query params: account_id (required, can be comma-list), start_date, end_date,
                transaction_type (invoice|bill|payment|journal|all), page, page_size
  ```
- **Rendering:** Paginated table with sticky account header and running balance column. Account switcher sidebar. Click transaction row → source document (invoice, bill, journal). Export PDF/XLSX/CSV (full, not just current page).
- **Automations:** Audit ledger cross-reference: each GL line links to its `audit_ledger_entry_id` for tamper evidence.
- **Personalized / better-than-Zoho:** Audit trail is cryptographically linked (unique to Astram). Search within GL by amount, reference, description — instant filter. AI: "Account 4001 shows ₹14,000 manual credit with no linked source document — possible error."
- **Build status:** **New.**

---

### B6. Journal Report

- **Purpose:** List all manual journal entries with their lines.
- **Zoho Books behaviour:** Shows all journals in a period; columns: date, journal#, reference, notes, debit, credit. Filter by date range, transaction type, account. Shows audit numbers if enabled.
- **Data model / query:**
  ```sql
  SELECT je.id, je.journal_number, je.entry_date, je.reference, je.notes,
         je.status, je.created_by,
         JSON_ARRAYAGG(JSON_OBJECT(
           'account', coa.account_name, 'debit_credit', jel.debit_credit,
           'amount', jel.amount, 'description', jel.description
         )) AS lines
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.entry_date BETWEEN :start AND :end
  GROUP BY je.id;
  ```
- **API (contract-first):**
  ```
  GET /api/reports/journal-report
  Query params: start_date, end_date, created_by, status (draft|posted), page, page_size
  ```
- **Rendering:** Master-detail: journal list (left) + selected journal lines (right panel). Status badge (Draft/Posted). Export PDF/XLSX/CSV.
- **Automations:** Audit ledger hash per posted journal — tamper detection if hash mismatch.
- **Personalized / better-than-Zoho:** AI flags unusual manual journals (large round numbers, weekend entries, reversals without originals). One-click reverse journal.
- **Build status:** **New.**

---

### B7. Account Transactions

- **Purpose:** All transactions touching a specific account, regardless of source (invoice, bill, journal, payment).
- **Zoho Books behaviour:** Filterable by account, date range, transaction type. Shows transaction date, type, reference, debit, credit, balance.
- **Data model / query:** Same as General Ledger but with explicit `transaction_type` column derived from `journal_entries.source_type` (invoice|bill|payment|manual_journal|expense).
- **API (contract-first):**
  ```
  GET /api/reports/account-transactions
  Query params: account_id, start_date, end_date, transaction_type, page, page_size
  ```
- **Rendering:** Table with transaction-type filter chips. Running balance. Click row → source document.
- **Automations:** None beyond GL.
- **Personalized / better-than-Zoho:** Multi-account view — select up to 5 accounts side by side. AI anomaly: sudden balance spikes.
- **Build status:** **New.**

---

### B8. Movement of Equity

- **Purpose:** Show how equity changed across a period: opening balance + net income + additional contributions − distributions = closing balance.
- **Zoho Books behaviour:** Simple table: opening equity, profit/loss, other changes, closing equity. Compare prior period.
- **Data model / query:** Aggregate `chart_of_accounts` where `account_type = 'equity'` using the same journal entry line approach as Balance Sheet, split by equity sub-type.
- **API (contract-first):**
  ```
  GET /api/reports/movement-of-equity
  Query params: start_date, end_date, compare, compare_start, compare_end
  ```
- **Rendering:** Statement-format table. Export PDF/XLSX/CSV.
- **Automations:** Month-end snapshot.
- **Personalized / better-than-Zoho:** Waterfall Recharts chart showing equity build/draw components visually.
- **Build status:** **New.**

---

## C. Accounts Receivable Reports

### C1. AR Aging Summary

- **Purpose:** Outstanding receivables bucketed by days overdue (Current, 1-30, 31-60, 61-90, 90+) at the customer level.
- **Zoho Books behaviour:** Table with one row per customer, columns per aging bucket, grand total row. Filters: as-of date, customer, currency. Supports monthly interval comparison.
- **Data model / query:**
  ```sql
  SELECT c.id, c.name,
    SUM(CASE WHEN DATEDIFF(:as_of, i.due_date) <= 0 THEN i.amount_due ELSE 0 END) AS current_amt,
    SUM(CASE WHEN DATEDIFF(:as_of, i.due_date) BETWEEN 1 AND 30 THEN i.amount_due ELSE 0 END) AS d1_30,
    SUM(CASE WHEN DATEDIFF(:as_of, i.due_date) BETWEEN 31 AND 60 THEN i.amount_due ELSE 0 END) AS d31_60,
    SUM(CASE WHEN DATEDIFF(:as_of, i.due_date) BETWEEN 61 AND 90 THEN i.amount_due ELSE 0 END) AS d61_90,
    SUM(CASE WHEN DATEDIFF(:as_of, i.due_date) > 90 THEN i.amount_due ELSE 0 END) AS over_90
  FROM invoices i JOIN customers c ON c.id = i.customer_id
  WHERE i.status NOT IN ('paid','cancelled','void') AND i.amount_due > 0
    AND i.invoice_date <= :as_of
  GROUP BY c.id;
  ```
  Consider a `v_ar_aging` MySQL view.
- **API (contract-first):**
  ```
  GET /api/reports/ar-aging-summary
  Query params: as_of (YYYY-MM-DD), customer_id, currency, page, page_size
  ```
- **Rendering:** Sortable table; click customer → AR Aging Details for that customer. Colour-coded bucket headers. Footer totals. Recharts `BarChart` below table showing bucket totals. Export PDF/XLSX/CSV.
- **Automations:** Nightly snapshot to `ar_aging_snapshots` for trend; scheduled email weekly to CFO.
- **Personalized / better-than-Zoho:** One-click "Send reminder to all 90+ overdue customers." AI: "3 customers account for 78% of your 90+ bucket — prioritise collections there." DSO (Days Sales Outstanding) computed and shown as a KPI above the table.
- **Build status:** **New** (dashboard widget exists; full report page is new).

---

### C2. AR Aging Details

- **Purpose:** Invoice-level aging — every unpaid invoice with its aging bucket.
- **Zoho Books behaviour:** Flat list of invoices: customer, invoice#, invoice date, due date, amount, overdue days, balance due, bucket.
- **Data model / query:** Same as C1 but no GROUP BY — return individual `invoices` rows with a computed `DATEDIFF(:as_of, due_date)` column.
- **API (contract-first):**
  ```
  GET /api/reports/ar-aging-details
  Query params: as_of, customer_id, bucket (current|1-30|31-60|61-90|over-90|all), page, page_size
  ```
- **Rendering:** Filterable table. Row click → Invoice detail page. Bulk action: "Send reminders to selected." Export PDF/XLSX/CSV.
- **Automations:** Auto-send reminder emails based on aging rules configured in `collection_rules` table.
- **Personalized / better-than-Zoho:** Inline "Send Reminder" button per row. AI-suggested collection priority order based on customer payment history.
- **Build status:** **New.**

---

### C3. Customer Balance Summary

- **Purpose:** Net balance owed by each customer (invoice total − payments − credit notes).
- **Zoho Books behaviour:** One row per customer: total invoiced, payments, credit notes, balance. Filters: date range, customer.
- **Data model / query:**
  ```sql
  SELECT c.id, c.name,
    SUM(i.total) AS total_invoiced,
    SUM(pr.amount) AS total_paid,
    SUM(cn.total) AS total_credited,
    (SUM(i.total) - SUM(pr.amount) - SUM(cn.total)) AS balance
  FROM customers c
  LEFT JOIN invoices i ON i.customer_id = c.id AND i.status != 'void'
  LEFT JOIN payments_received pr ON pr.customer_id = c.id
  LEFT JOIN credit_notes cn ON cn.customer_id = c.id
  GROUP BY c.id;
  ```
- **API (contract-first):**
  ```
  GET /api/reports/customer-balance-summary
  Query params: as_of, start_date, end_date, customer_id, page, page_size
  ```
- **Rendering:** Sortable table; click customer → Customer Balance Details (all invoices for that customer). Export PDF/XLSX/CSV.
- **Automations:** Weekly email digest option per customer (customer-facing statement).
- **Personalized / better-than-Zoho:** Payment health score per customer (on-time %, avg days to pay). AI flag on customers whose balance is growing faster than their payment rate.
- **Build status:** **New.**

---

### C4. Customer Balance Details

- **Purpose:** Invoice-level breakdown for a specific customer.
- **Zoho Books behaviour:** All invoices + credits for a customer in a date range: date, invoice#, due date, amount, paid, balance.
- **Data model / query:** Flat join of `invoices`, `credit_notes`, `payments_received` filtered by `customer_id`.
- **API (contract-first):** `GET /api/reports/customer-balance-details?customer_id=&start_date=&end_date=`
- **Rendering:** Table with type badge (Invoice/Credit Note/Payment). Totals footer. Export PDF — this doubles as a Customer Statement.
- **Automations:** "Email statement to customer" action → renders PDF and sends via email service.
- **Personalized / better-than-Zoho:** Customer-facing portal link sends a live-updating statement URL (not just a static PDF).
- **Build status:** **New.**

---

### C5. Invoice Details

- **Purpose:** All invoices in a period with status, amounts, and balance.
- **Zoho Books behaviour:** List of invoices: customer, date, due date, invoice#, status, amount, balance. Filters: date range, customer, status, salesperson.
- **Data model / query:** Direct query on `invoices` JOIN `customers`. Paginated.
- **API (contract-first):**
  ```
  GET /api/reports/invoice-details
  Query params: start_date, end_date, customer_id, status, salesperson_id, page, page_size
  ```
- **Rendering:** Sortable/filterable table. Click → Invoice detail. Bulk export. Export PDF/XLSX/CSV.
- **Automations:** Scheduled weekly email: "Invoices sent this week" digest.
- **Personalized / better-than-Zoho:** Inline status-change actions (mark sent, record payment). AI: highlights invoices with unusual terms or amounts vs that customer's history.
- **Build status:** **New.**

---

### C6. Retainer Invoice Details

- **Purpose:** Track retainer invoices and how much retainer has been applied vs remains.
- **Zoho Books behaviour:** Lists retainer invoices with amount, applied amount, remaining balance.
- **Data model / query:** `invoices` WHERE `invoice_type = 'retainer'` + `retainer_applications` join.
- **API (contract-first):** `GET /api/reports/retainer-invoice-details?start_date=&end_date=&customer_id=`
- **Rendering:** Table. Export PDF/XLSX/CSV.
- **Automations:** Alert when retainer balance falls below threshold.
- **Personalized / better-than-Zoho:** Visual gauge of retainer consumed vs remaining per customer.
- **Build status:** **New.**

---

### C7. Payments Received

- **Purpose:** All payments received in a period: date, customer, invoice, amount, mode.
- **Zoho Books behaviour:** List with filters: date range, customer, payment mode.
- **Data model / query:** `payments_received` JOIN `customers` JOIN `invoices`.
- **API (contract-first):** `GET /api/reports/payments-received?start_date=&end_date=&customer_id=&payment_mode=`
- **Rendering:** Table. Recharts `PieChart` of payment mode distribution below. Export PDF/XLSX/CSV.
- **Automations:** Daily payment summary email.
- **Personalized / better-than-Zoho:** Payment mode analytics chart (cash/bank/UPI/cheque). AI: "UPI payments average 2.3 days faster than cheque — nudge customers toward UPI."
- **Build status:** **New.**

---

### C8. Time to Get Paid

- **Purpose:** Average days between invoice issue and payment receipt by customer/period.
- **Zoho Books behaviour:** Simple table: customer, average days to pay, invoice count.
- **Data model / query:**
  ```sql
  SELECT c.id, c.name, AVG(DATEDIFF(pr.payment_date, i.invoice_date)) AS avg_days,
         COUNT(i.id) AS invoice_count
  FROM invoices i JOIN payments_received pr ON pr.invoice_id = i.id
  JOIN customers c ON c.id = i.customer_id
  WHERE pr.payment_date BETWEEN :start AND :end
  GROUP BY c.id;
  ```
- **API (contract-first):** `GET /api/reports/time-to-get-paid?start_date=&end_date=`
- **Rendering:** Table sorted by avg_days desc. Recharts `BarChart` of top 10 slowest customers. DSO trend `LineChart` over 12 months.
- **Automations:** Include in weekly CFO digest.
- **Personalized / better-than-Zoho:** DSO trend line. AI: "DSO increased to 42 days (from 35 last quarter) — 3 new enterprise customers are paying slowly."
- **Build status:** **New.**

---

### C9. Credit Note Details

- **Purpose:** All credit notes issued with applied/unapplied amounts.
- **Zoho Books behaviour:** List: date, credit note#, customer, amount, applied, balance.
- **Data model / query:** `credit_notes` JOIN `customers`.
- **API (contract-first):** `GET /api/reports/credit-note-details?start_date=&end_date=&customer_id=`
- **Rendering:** Table. Export PDF/XLSX/CSV.
- **Automations:** Alert on unapplied credit notes older than 60 days.
- **Personalized / better-than-Zoho:** AI: "₹28,000 in credit notes have been unapplied for > 60 days — apply or refund?"
- **Build status:** **New.**

---

### C10. Refund History

- **Purpose:** All refunds issued to customers.
- **Zoho Books behaviour:** List: date, customer, credit note, refund mode, amount.
- **Data model / query:** `refunds` JOIN `customers` JOIN `credit_notes`.
- **API (contract-first):** `GET /api/reports/refund-history?start_date=&end_date=&customer_id=`
- **Rendering:** Table. Export PDF/XLSX/CSV.
- **Automations:** Refund volume alert threshold.
- **Personalized / better-than-Zoho:** Monthly refund rate KPI vs revenue — flag if > configurable %.
- **Build status:** **New.**

---

### C11. Sales Order Details

- **Purpose:** All sales orders in a period with status, fulfilment progress.
- **Zoho Books behaviour:** List: date, SO#, customer, status, amount, invoiced amount.
- **Data model / query:** `sales_orders` JOIN `customers`.
- **API (contract-first):** `GET /api/reports/sales-order-details?start_date=&end_date=&status=&customer_id=`
- **Rendering:** Table with status badge and fulfilment % progress bar. Export PDF/XLSX/CSV.
- **Automations:** Alert on SOs older than 30 days not yet invoiced.
- **Build status:** **New.**

---

### C12. Quote Details

- **Purpose:** All quotes with conversion status.
- **Zoho Books behaviour:** List: date, quote#, customer, expiry, amount, status.
- **Data model / query:** `quotes` JOIN `customers`.
- **API (contract-first):** `GET /api/reports/quote-details?start_date=&end_date=&status=&customer_id=`
- **Rendering:** Table. Win rate KPI (converted/total). Export PDF/XLSX/CSV.
- **Personalized / better-than-Zoho:** Conversion funnel chart (Quotes → SOs → Invoices → Paid). AI win-rate trend.
- **Build status:** **New.**

---

## D. Sales Reports

### D1. Sales by Customer

- **Purpose:** Total sales per customer for a period.
- **Zoho Books behaviour:** One row per customer: invoice count, sales amount (with/without tax). Filters: date range, include/exclude non-invoice transactions and manual journals.
- **Data model / query:**
  ```sql
  SELECT c.id, c.name, COUNT(i.id) AS invoice_count,
         SUM(i.sub_total) AS sales_excl_tax, SUM(i.total) AS sales_incl_tax
  FROM invoices i JOIN customers c ON c.id = i.customer_id
  WHERE i.invoice_date BETWEEN :start AND :end AND i.status != 'void'
  GROUP BY c.id ORDER BY sales_incl_tax DESC;
  ```
- **API (contract-first):** `GET /api/reports/sales-by-customer?start_date=&end_date=&include_journals=`
- **Rendering:** Sortable table. Recharts `BarChart` top 10 customers. Click customer → Invoice Details pre-filtered. Export PDF/XLSX/CSV.
- **Automations:** Include in monthly sales digest.
- **Personalized / better-than-Zoho:** Market share ring chart (top 5 + others). Growth rate column vs prior period.
- **Build status:** **New.**

---

### D2. Sales by Item

- **Purpose:** Revenue and quantity by product/service item.
- **Zoho Books behaviour:** One row per item: quantity sold, sales amount, average price. Filters: date range, account, reporting tags.
- **Data model / query:**
  ```sql
  SELECT it.id, it.name, SUM(il.quantity) AS qty_sold,
         SUM(il.quantity * il.unit_price) AS gross_revenue,
         AVG(il.unit_price) AS avg_price
  FROM invoice_line_items il JOIN items it ON it.id = il.item_id
  JOIN invoices i ON i.id = il.invoice_id
  WHERE i.invoice_date BETWEEN :start AND :end AND i.status != 'void'
  GROUP BY it.id ORDER BY gross_revenue DESC;
  ```
- **API (contract-first):** `GET /api/reports/sales-by-item?start_date=&end_date=&item_id=&account_id=`
- **Rendering:** Table + Recharts `BarChart` top 10 items by revenue. Export PDF/XLSX/CSV.
- **Personalized / better-than-Zoho:** ABC classification of items by revenue contribution. Price variance flag (same item sold at different prices).
- **Build status:** **New.**

---

### D3. Sales by Salesperson

- **Purpose:** Performance breakdown by user/salesperson.
- **Zoho Books behaviour:** Two sections: invoices and credit notes by salesperson. Shows count and amounts.
- **Data model / query:**
  ```sql
  SELECT u.id, u.name,
    COUNT(i.id) AS invoice_count, SUM(i.total) AS invoice_total,
    COUNT(cn.id) AS credit_note_count, SUM(cn.total) AS credit_note_total
  FROM users u
  LEFT JOIN invoices i ON i.salesperson_id = u.id AND i.invoice_date BETWEEN :start AND :end
  LEFT JOIN credit_notes cn ON cn.salesperson_id = u.id AND cn.credit_note_date BETWEEN :start AND :end
  GROUP BY u.id;
  ```
- **API (contract-first):** `GET /api/reports/sales-by-salesperson?start_date=&end_date=`
- **Rendering:** Table + leaderboard chart. Export PDF/XLSX/CSV.
- **Personalized / better-than-Zoho:** Target vs actuals if salesperson quotas are configured. Commission calculator column.
- **Build status:** **New.**

---

### D4. Sales Summary

- **Purpose:** Aggregate sales totals (total sales, tax, items sold, quantity) for a period.
- **Zoho Books behaviour:** High-level summary; adjustments for credit notes; groupable by period.
- **Data model / query:** Aggregate `invoices` + `credit_notes` with tax breakdown.
- **API (contract-first):** `GET /api/reports/sales-summary?start_date=&end_date=&group_by=month|quarter|year`
- **Rendering:** Summary cards + Recharts `BarChart` grouped by period. Export PDF/XLSX/CSV.
- **Build status:** **New.**

---

## E. Accounts Payable Reports

### E1. AP Aging Summary

- **Purpose:** Outstanding bills bucketed by days overdue at the vendor level.
- **Zoho Books behaviour:** Mirror of AR Aging Summary for bills. Filters: as-of date, vendor. Monthly interval comparison.
- **Data model / query:** Same as C1 but on `bills` JOIN `vendors`. Consider `v_ap_aging` MySQL view.
  ```sql
  SELECT v.id, v.name,
    SUM(CASE WHEN DATEDIFF(:as_of, b.due_date) <= 0 THEN b.amount_due ELSE 0 END) AS current_amt,
    SUM(CASE WHEN DATEDIFF(:as_of, b.due_date) BETWEEN 1 AND 30 THEN b.amount_due ELSE 0 END) AS d1_30,
    SUM(CASE WHEN DATEDIFF(:as_of, b.due_date) BETWEEN 31 AND 60 THEN b.amount_due ELSE 0 END) AS d31_60,
    SUM(CASE WHEN DATEDIFF(:as_of, b.due_date) BETWEEN 61 AND 90 THEN b.amount_due ELSE 0 END) AS d61_90,
    SUM(CASE WHEN DATEDIFF(:as_of, b.due_date) > 90 THEN b.amount_due ELSE 0 END) AS over_90
  FROM bills b JOIN vendors v ON v.id = b.vendor_id
  WHERE b.status NOT IN ('paid','cancelled','void') AND b.amount_due > 0
    AND b.bill_date <= :as_of
  GROUP BY v.id;
  ```
- **API (contract-first):**
  ```
  GET /api/reports/ap-aging-summary
  Query params: as_of, vendor_id, currency, page, page_size
  ```
- **Rendering:** Table + Recharts `BarChart` of bucket totals. Click vendor → AP Aging Details. Export PDF/XLSX/CSV.
- **Automations:** Alert when over-90 bucket exceeds threshold. Include in weekly payables digest.
- **Personalized / better-than-Zoho:** DPO (Days Payable Outstanding) KPI shown above table. AI: "Paying 3 vendors early could unlock ₹12,000 in early-payment discounts."
- **Build status:** **New** (widget exists; full report page is new).

---

### E2. AP Aging Details

- **Purpose:** Bill-level aging breakdown.
- **Zoho Books behaviour:** Every unpaid bill with aging bucket, days overdue, balance.
- **Data model / query:** `bills` JOIN `vendors` with `DATEDIFF` computed column.
- **API (contract-first):** `GET /api/reports/ap-aging-details?as_of=&vendor_id=&bucket=&page=&page_size=`
- **Rendering:** Table. Bulk "Schedule Payment" action for selected bills. Export PDF/XLSX/CSV.
- **Personalized / better-than-Zoho:** Payment scheduling calendar integration. AI prioritisation of which bills to pay first given cash position.
- **Build status:** **New.**

---

### E3. Vendor Balance Summary

- **Purpose:** Net amount owed to each vendor.
- **Zoho Books behaviour:** One row per vendor: bill total, payments made, balance. Excess payment tracked.
- **Data model / query:**
  ```sql
  SELECT v.id, v.name,
    SUM(b.total) AS total_billed, SUM(vp.amount) AS total_paid,
    (SUM(b.total) - SUM(vp.amount)) AS balance
  FROM vendors v
  LEFT JOIN bills b ON b.vendor_id = v.id AND b.status != 'void'
  LEFT JOIN vendor_payments vp ON vp.vendor_id = v.id
  GROUP BY v.id;
  ```
- **API (contract-first):** `GET /api/reports/vendor-balance-summary?as_of=&vendor_id=&page=&page_size=`
- **Rendering:** Sortable table. Click vendor → Vendor Balance Details. Export PDF/XLSX/CSV.
- **Personalized / better-than-Zoho:** Vendor payment reliability score (% of bills paid on time). AI: flags vendors where balance is growing unsustainably.
- **Build status:** **New.**

---

### E4. Vendor Balance Details

- **Purpose:** All bills and payments for a specific vendor.
- **Zoho Books behaviour:** Flat list: date, bill#, due date, amount, paid, balance. Clicking BALANCE on Vendor Balance Summary navigates here.
- **Data model / query:** `bills` + `vendor_payments` for a specific `vendor_id`.
- **API (contract-first):** `GET /api/reports/vendor-balance-details?vendor_id=&start_date=&end_date=`
- **Rendering:** Table. "Email statement to vendor" action. Export PDF — Vendor Statement.
- **Build status:** **New.**

---

### E5. Bill Details

- **Purpose:** All bills in a period with status and balance.
- **Zoho Books behaviour:** List: vendor, bill date, due date, bill#, status, bill amount, balance. Real-time status filter.
- **Data model / query:** `bills` JOIN `vendors`. Paginated.
- **API (contract-first):** `GET /api/reports/bill-details?start_date=&end_date=&vendor_id=&status=&page=&page_size=`
- **Rendering:** Sortable table. Click → Bill detail. Bulk approve/pay actions. Export PDF/XLSX/CSV.
- **Personalized / better-than-Zoho:** AI: flags bills that match known invoice amounts (potential duplicate).
- **Build status:** **New.**

---

### E6. Purchase Order Details

- **Purpose:** All POs with receipt and billing status.
- **Zoho Books behaviour:** List: vendor, PO#, date, status, amount, billed amount.
- **Data model / query:** `purchase_orders` JOIN `vendors`.
- **API (contract-first):** `GET /api/reports/purchase-order-details?start_date=&end_date=&vendor_id=&status=`
- **Rendering:** Table with receipt % and billed % progress bars. Export PDF/XLSX/CSV.
- **Personalized / better-than-Zoho:** Unfulfilled PO alert (PO > 30 days, no receipt recorded).
- **Build status:** **New.**

---

### E7. Prepaid Expenses

- **Purpose:** Track prepaid amounts that haven't yet been expensed.
- **Zoho Books behaviour:** List of prepaid expense accounts with remaining balance.
- **Data model / query:** `chart_of_accounts` WHERE `account_sub_type = 'prepaid_expense'` + running balance from journal entries.
- **API (contract-first):** `GET /api/reports/prepaid-expenses?as_of=`
- **Rendering:** Table with amortisation schedule link. Export PDF/XLSX/CSV.
- **Build status:** **New.**

---

## F. Purchases Reports

### F1. Purchases by Vendor

- **Purpose:** Total quantities ordered, received, and billed per vendor.
- **Zoho Books behaviour:** Columns: vendor name, qty ordered, qty received, qty to be billed. Filter by date range.
- **Data model / query:**
  ```sql
  SELECT v.id, v.name,
    SUM(pol.quantity) AS qty_ordered,
    SUM(pol.quantity_received) AS qty_received,
    SUM(pol.quantity - pol.quantity_billed) AS qty_to_bill
  FROM purchase_order_lines pol
  JOIN purchase_orders po ON po.id = pol.purchase_order_id
  JOIN vendors v ON v.id = po.vendor_id
  WHERE po.po_date BETWEEN :start AND :end
  GROUP BY v.id;
  ```
- **API (contract-first):** `GET /api/reports/purchases-by-vendor?start_date=&end_date=&vendor_id=`
- **Rendering:** Table. Export PDF/XLSX/CSV.
- **Personalized / better-than-Zoho:** Spend concentration analysis (Herfindahl index). AI: "72% of your spend is with 2 vendors — consider diversifying."
- **Build status:** **New.**

---

### F2. Purchases by Item

- **Purpose:** Quantity and spend per purchased item across all vendors.
- **Zoho Books behaviour:** Filter by date range. Shows qty, amount per item.
- **Data model / query:**
  ```sql
  SELECT it.id, it.name, SUM(bl.quantity) AS qty_purchased,
         SUM(bl.quantity * bl.unit_price) AS total_spend, AVG(bl.unit_price) AS avg_price
  FROM bill_line_items bl JOIN items it ON it.id = bl.item_id
  JOIN bills b ON b.id = bl.bill_id
  WHERE b.bill_date BETWEEN :start AND :end AND b.status != 'void'
  GROUP BY it.id;
  ```
- **API (contract-first):** `GET /api/reports/purchases-by-item?start_date=&end_date=&item_id=`
- **Rendering:** Table + Recharts `BarChart` top items by spend. Export PDF/XLSX/CSV.
- **Personalized / better-than-Zoho:** Price trend `LineChart` per item over 12 months. AI: "Unit price of Item X has risen 14% over 6 months — consider locking in a contract."
- **Build status:** **New.**

---

### F3. Vendor Payments

- **Purpose:** All payments made to vendors in a period.
- **Zoho Books behaviour:** List: date, vendor, bill, payment mode, amount.
- **Data model / query:** `vendor_payments` JOIN `vendors` JOIN `bills`.
- **API (contract-first):** `GET /api/reports/vendor-payments?start_date=&end_date=&vendor_id=&payment_mode=`
- **Rendering:** Table + Recharts `PieChart` by payment mode. Export PDF/XLSX/CSV.
- **Build status:** **New.**

---

## G. Tax Reports

### G1. Tax Summary

- **Purpose:** Total tax collected on invoices and incurred on expenses by tax name.
- **Zoho Books behaviour:** Columns: tax name, tax %, taxable amount, tax charged/paid. Filters: date range, cash/accrual, transaction type (sales/purchase/both).
- **Data model / query:**
  ```sql
  -- Tax collected (from invoices)
  SELECT t.name, t.rate,
    SUM(il.taxable_amount) AS taxable_amount,
    SUM(il.tax_amount) AS tax_collected
  FROM invoice_tax_lines il JOIN taxes t ON t.id = il.tax_id
  JOIN invoices i ON i.id = il.invoice_id
  WHERE i.invoice_date BETWEEN :start AND :end AND i.status != 'void'
  GROUP BY t.id;
  ```
- **API (contract-first):**
  ```
  GET /api/reports/tax-summary
  Query params: start_date, end_date, basis (cash|accrual), transaction_type (sales|purchase|all)
  ```
- **Rendering:** Two-section table (Tax Collected / Tax Paid) with net tax liability row. Export PDF/XLSX/CSV — suitable for tax return preparation.
- **Automations:** Scheduled quarterly email for tax filing reminder. Snapshot at quarter-end.
- **Personalized / better-than-Zoho:** AI: "Your GST liability for Q1 is ₹84,320 — due by Apr 20." One-click export formatted for GST return portal. Tax calendar widget showing upcoming deadlines.
- **Build status:** **New.**

---

### G2. TDS Receivables Summary

- **Purpose:** Total withholding tax deducted by customers on payments; what the business can claim back.
- **Zoho Books behaviour:** Columns: TDS name, %, original total, amount after deduction, TDS deducted. Filter: date range.
- **Data model / query:** `invoice_tds_lines` JOIN `tds_types` JOIN `invoices`.
- **API (contract-first):** `GET /api/reports/tds-receivables-summary?start_date=&end_date=`
- **Rendering:** Table. Export PDF/XLSX/CSV.
- **Personalized / better-than-Zoho:** Certificate tracker — flag where Form 16A is outstanding from customers.
- **Build status:** **New.**

---

### G3. TDS Payables Summary

- **Purpose:** Withholding tax deducted by the business on vendor payments; what must be remitted to tax authorities.
- **Zoho Books behaviour:** Mirror of TDS Receivables for outbound TDS.
- **Data model / query:** `vendor_payment_tds_lines` JOIN `tds_types` JOIN `vendor_payments`.
- **API (contract-first):** `GET /api/reports/tds-payables-summary?start_date=&end_date=`
- **Rendering:** Table + remittance due date column. Export PDF/XLSX/CSV.
- **Personalized / better-than-Zoho:** Remittance due date countdown + one-click mark as remitted.
- **Build status:** **New.**

---

## H. Inventory Reports

### H1. Inventory Summary

- **Purpose:** Current stock levels, value, and reorder status for all items.
- **Zoho Books behaviour:** Columns: item name, SKU, opening stock, quantity in, quantity out, closing stock, stock value.
- **Data model / query:**
  ```sql
  SELECT it.id, it.name, it.sku, it.reorder_point, it.stock_on_hand,
         it.stock_on_hand * it.purchase_price AS stock_value
  FROM items it WHERE it.track_inventory = TRUE;
  ```
  For historical closing stock: fold in `inventory_transactions` for the period.
- **API (contract-first):** `GET /api/reports/inventory-summary?as_of=&item_id=`
- **Rendering:** Table with reorder-status badge (OK/Low/Out). Recharts `BarChart` of top items by value. Export PDF/XLSX/CSV.
- **Automations:** Daily check: alert if any item drops below `reorder_point`.
- **Personalized / better-than-Zoho:** Reorder suggestion with suggested quantity based on average consumption rate. AI: "At current burn rate, Item Y will stock out in 8 days."
- **Build status:** **New.**

---

### H2. Inventory Valuation Summary

- **Purpose:** Total inventory value by item and category, used for balance sheet and cost tracking.
- **Zoho Books behaviour:** Columns: item, quantity, cost per unit, total value. Groupable by account.
- **Data model / query:** Same as H1 but focused on cost × quantity; respects FIFO lots if enabled.
- **API (contract-first):** `GET /api/reports/inventory-valuation-summary?as_of=&group_by=item|category`
- **Rendering:** Table. Total at footer must tie to Balance Sheet inventory asset. Export PDF/XLSX/CSV.
- **Automations:** Month-end snapshot for balance sheet tie-out.
- **Build status:** **New.**

---

### H3. FIFO Cost Lot Tracking

- **Purpose:** Track individual purchase lots under FIFO costing; which lots have been consumed and at what cost.
- **Zoho Books behaviour:** Shows lot entries: date, quantity in, cost per unit, quantity remaining, total remaining value.
- **Data model / query:** `inventory_lots` table tracking each purchase receipt; `inventory_lot_consumptions` for FIFO depletion.
- **API (contract-first):** `GET /api/reports/fifo-cost-lot-tracking?item_id=&as_of=`
- **Rendering:** Nested table (item → lots). Export PDF/XLSX/CSV.
- **Build status:** **New.**

---

### H4. ABC Classification

- **Purpose:** Classify inventory items into A (high value), B (medium), C (low) by revenue contribution.
- **Zoho Books behaviour:** Auto-classifies based on sales; shows classification, revenue contribution %.
- **Data model / query:** Compute `SUM(revenue)` per item over trailing 12 months; rank and apply ABC thresholds (top 20% = A, next 30% = B, rest = C).
- **API (contract-first):** `GET /api/reports/inventory-abc-classification?period_months=12`
- **Rendering:** Table + Recharts `PieChart` of A/B/C share of total revenue. Export PDF/XLSX/CSV.
- **Personalized / better-than-Zoho:** Configurable thresholds (not hardcoded 80/15/5 Pareto). AI: "5 C-class items have zero sales in 6 months — consider discontinuing."
- **Build status:** **New.**

---

### H5. Product Sales

- **Purpose:** Units sold and revenue per product over a period (inventory-linked version of Sales by Item).
- **Zoho Books behaviour:** Shows product name, qty sold, revenue. Filters: date range.
- **Data model / query:** `invoice_line_items` + `items` with inventory tracking flag.
- **API (contract-first):** `GET /api/reports/product-sales?start_date=&end_date=&item_id=`
- **Rendering:** Table. Export PDF/XLSX/CSV.
- **Build status:** **New.**

---

## I. Accountant Reports (also covered in B above)

### I1. Audit Trail

- **Purpose:** Who did what and when — every create/edit/delete action on financial records.
- **Zoho Books behaviour:** Activity log under Reports: user, action (created/edited/deleted), entity type, entity ID, timestamp.
- **Data model / query:** The tamper-evident `audit_ledger` table already in the Astram portal. Query with filters.
- **API (contract-first):**
  ```
  GET /api/reports/audit-trail
  Query params: start_date, end_date, user_id, entity_type, action_type, page, page_size
  ```
- **Rendering:** Table. Hash verification column — green checkmark if chain intact, red if tampered. Export PDF/XLSX/CSV.
- **Automations:** Alert on tamper detection. Monthly audit trail export for compliance.
- **Personalized / better-than-Zoho:** Cryptographic tamper-evidence is unique to Astram. AI: flags unusual patterns (mass deletions, off-hours edits). Role-based access: only org admins can view.
- **Build status:** **Partial** — ledger exists; report UI is new.

---

## J. Budget Reports

### J1. Budget vs Actuals (P&L)

- **Purpose:** Compare planned revenue/expenses against actual for a period.
- **Zoho Books behaviour:** Budget module: create budgets with monthly/quarterly/annual figures per account. Budget vs Actuals report on P&L, Balance Sheet, Cash Flow. Filters: budget name, account type, period. Export: PDF, XLS, XLSX.
- **Data model / query:**
  - `budgets(id, name, fiscal_year, period_type, org_id)`
  - `budget_lines(id, budget_id, account_id, period_start, amount)`
  - Join actual amounts from journal entries (same query as P&L) with budget lines on `account_id` + period:
  ```sql
  SELECT bl.account_id, coa.account_name,
         bl.amount AS budgeted,
         COALESCE(SUM(actual.net), 0) AS actual_amount,
         (COALESCE(SUM(actual.net), 0) - bl.amount) AS variance,
         ROUND((COALESCE(SUM(actual.net), 0) / NULLIF(bl.amount, 0) - 1) * 100, 2) AS variance_pct
  FROM budget_lines bl
  JOIN chart_of_accounts coa ON coa.id = bl.account_id
  LEFT JOIN (
    SELECT jel.account_id, SUM(jel.amount * jel.direction_multiplier) AS net
    FROM journal_entry_lines jel JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.entry_date BETWEEN :start AND :end AND je.status = 'posted'
    GROUP BY jel.account_id
  ) actual ON actual.account_id = bl.account_id
  WHERE bl.budget_id = :budget_id AND bl.period_start BETWEEN :start AND :end
  GROUP BY bl.account_id, coa.account_name, bl.amount;
  ```
- **API (contract-first):**
  ```
  GET /api/reports/budget-vs-actuals
  Query params: budget_id, start_date, end_date, basis, account_type, page, page_size
  POST /api/budgets              — create budget
  GET  /api/budgets              — list budgets
  PUT  /api/budgets/:id          — update budget
  POST /api/budgets/:id/lines    — upsert budget lines (bulk)
  ```
- **Rendering:** Three-column table (Budget | Actual | Variance). Variance column colour-coded (green = under budget for expenses, red = over). Waterfall chart option (Recharts `BarChart` with reference lines). Export PDF/XLSX/CSV.
- **Automations:** Monthly variance alert: email if any line item exceeds budget by > configurable %. Period-close budget snapshot.
- **Personalized / better-than-Zoho:** (1) Historical data auto-fill when creating next year's budget (Zoho has this; match it). (2) AI budget suggestions: "Based on trailing 3 years, we suggest ₹2.4M for marketing in FY27." (3) Scenario modelling: duplicate a budget and adjust percentages to model different scenarios. (4) Real-time tracking widget on dashboard showing budget burn rate.
- **Build status:** **New.**

---

## K. Business Performance Reports

### K1. Business Performance Ratios

- **Purpose:** Eight key financial ratios for management review.
- **Zoho Books behaviour:** Eight metrics: Current Ratio, Quick Ratio (Acid Test), Gross Profit Ratio, Net Profit Ratio, Debt Ratio, Debt-to-Equity Ratio, Receivable Turnover Ratio, Operating Cost Ratio. Point-in-time with date filter.
- **Data model / query:** Derive all eight from balance sheet and P&L aggregates computed on demand:
  - Current Ratio = Current Assets / Current Liabilities
  - Quick Ratio = (Current Assets − Inventory) / Current Liabilities
  - Gross Profit Ratio = Gross Profit / Revenue × 100
  - Net Profit Ratio = Net Profit / Revenue × 100
  - Debt Ratio = Total Liabilities / Total Assets
  - Debt-to-Equity = Total Liabilities / Total Equity
  - Receivable Turnover = Net Credit Sales / Average AR
  - Operating Cost Ratio = Operating Expenses / Net Revenue × 100
- **API (contract-first):**
  ```
  GET /api/reports/business-performance-ratios
  Query params: as_of (YYYY-MM-DD), compare_as_of
  ```
- **Rendering:** KPI card grid with trend arrow vs prior period and industry benchmark indicator. Recharts `RadarChart` showing ratio health across all eight dimensions. Historical trend `LineChart` for each ratio over 12 months. Export PDF.
- **Automations:** Include in monthly CFO digest email.
- **Personalized / better-than-Zoho:** (1) Industry benchmark overlays (configurable by SIC/sector code). (2) Historical 12-month trend chart per ratio — Zoho is point-in-time only. (3) AI narrative: "Quick ratio of 0.8 is below 1.0 — short-term liquidity risk; consider accelerating AR collection."
- **Build status:** **New.**

---

### K2. Cash Flow Forecast

- **Purpose:** Project future cash balance based on open invoices, bills, and recurring transactions.
- **Zoho Books behaviour:** Available on higher-tier plans; uses recurring invoice/bill profiles as forecast inputs. Users can add assumptions.
- **Data model / query:** See A7 (Dashboard Cash Forecast Widget) — same engine, surfaced as a full report page with more detail and scenario controls.
- **API (contract-first):** `GET /api/reports/cash-flow-forecast?horizon=90&scenario=base|optimistic|pessimistic`
- **Rendering:** Recharts `AreaChart` with three-scenario bands. Daily data table with drill-down. Export PDF/XLSX/CSV.
- **Automations:** Negative-cash alert trigger.
- **Personalized / better-than-Zoho:** Scenario analysis (base/optimistic/pessimistic). AI narrative. Sensitivity table: "What if AR collection is 10% slower?"
- **Build status:** **New.**

---

## L. Custom Report Builder

### L1. Custom Report Builder

- **Purpose:** Let users compose ad-hoc tabular reports from any entity/field in the system without writing SQL.
- **Zoho Books behaviour:** Available for P&L, Balance Sheet, Cash Flow, and Invoice Details. Users can add/remove/reorder columns, apply filters, save as a named custom report, and set sharing permissions.
- **Data model / query:**
  - `custom_reports(id, name, org_id, base_entity, column_definitions jsonb, filter_definitions jsonb, created_by, is_shared)`
  - At render time: dynamically compose a Drizzle query from the saved `column_definitions` and `filter_definitions`.
  - Base entities supported: `invoices`, `bills`, `customers`, `vendors`, `payments_received`, `vendor_payments`, `expenses`, `journal_entries`, `items`.
  - Use a query-builder service layer (not raw user SQL) to prevent injection and enforce org-level row isolation.
- **API (contract-first):**
  ```
  POST /api/reports/custom                   — create custom report definition
  GET  /api/reports/custom                   — list saved custom reports
  GET  /api/reports/custom/:id              — get definition
  PUT  /api/reports/custom/:id              — update definition
  DELETE /api/reports/custom/:id            — delete
  POST /api/reports/custom/:id/run          — execute and return data (paginated)
  POST /api/reports/custom/:id/export       — export to PDF/XLSX/CSV
  ```
- **Rendering:** Drag-and-drop column builder (shadcn `Sortable`). Filter panel with field/operator/value triples. Preview table (first 100 rows). Save and share dialog. Export on full dataset.
- **Automations:** Saved custom reports can be scheduled (same schedule engine as other reports).
- **Personalized / better-than-Zoho:** (1) Natural-language to report: "Show me all invoices from enterprise customers in Q1 with payment terms > 30 days" → AI translates to filter definitions. (2) Wider entity coverage than Zoho's four-report limitation. (3) Collaborative sharing with comment annotations.
- **Build status:** **New.**

---

## M. Report Delivery & Export Infrastructure

### M1. Export (PDF / XLSX / CSV)

- **Purpose:** Download any report in a chosen format.
- **Zoho Books behaviour:** Every report has an "Export As" menu: PDF (with configurable layout — table density, orientation, paper size, fonts), XLS, XLSX, CSV. Password-protect PDFs. Email export directly from the report page.
- **Data model / query:** No additional tables; the export service calls the same report endpoint, fetches the full dataset (bypassing pagination), and renders.
- **API (contract-first):**
  ```
  POST /api/reports/export
  Body: { reportKey: string, params: Record<string,string>, format: 'pdf'|'xlsx'|'csv',
          options?: { password?: string, orientation?: 'portrait'|'landscape' } }
  Response: 202 Accepted + { jobId: string }
  GET /api/reports/export/:jobId/status → { status: 'pending'|'ready'|'failed', downloadUrl? }
  ```
  Background job (Bull/BullMQ) renders asynchronously; signed S3/MinIO URL returned on completion.
- **Rendering:** "Export" dropdown in every report toolbar with format + orientation options. Progress toast while job runs. Download link on completion.
- **Automations:** Export jobs older than 24 hours auto-deleted from storage.
- **Personalized / better-than-Zoho:** Async export with progress tracking (Zoho can time-out on large exports). Password-protected PDFs. Branded report header (logo, org name, address, colour scheme pulled from org settings).
- **Build status:** **New.**

---

### M2. Scheduled Reports

- **Purpose:** Automatically generate and email reports on a recurring schedule.
- **Zoho Books behaviour:** Schedule any report for weekly, monthly, quarterly, or yearly delivery. Specify recipient email(s) and format (PDF/CSV/XLS). View and deactivate schedules from a dedicated page.
- **Data model / query:**
  ```sql
  -- report_schedules table
  CREATE TABLE report_schedules (
    id          CHAR(36) PRIMARY KEY,
    org_id      CHAR(36) NOT NULL,
    report_key  VARCHAR(100) NOT NULL,     -- e.g. 'profit-and-loss'
    params      JSON NOT NULL,             -- report query params
    format      ENUM('pdf','xlsx','csv') DEFAULT 'pdf',
    cron_expr   VARCHAR(50) NOT NULL,      -- e.g. '0 8 1 * *' (monthly on 1st at 8am)
    recipients  JSON NOT NULL,             -- array of email strings
    subject     VARCHAR(255),
    is_active   BOOLEAN DEFAULT TRUE,
    created_by  CHAR(36),
    created_at  DATETIME DEFAULT NOW(),
    last_run_at DATETIME,
    next_run_at DATETIME
  );
  ```
  Background cron worker (node-cron or BullMQ repeatable jobs) reads `report_schedules`, runs export, emails via SendGrid/Resend.
- **API (contract-first):**
  ```
  POST   /api/report-schedules               — create schedule
  GET    /api/report-schedules               — list schedules
  PUT    /api/report-schedules/:id           — update schedule
  DELETE /api/report-schedules/:id           — delete
  POST   /api/report-schedules/:id/run-now  — trigger immediate run
  ```
- **Rendering:** Schedule management page: list of schedules with next-run time, status toggle, edit/delete. "Schedule this report" button on every report toolbar opens a modal.
- **Automations:** The system itself is the automation.
- **Personalized / better-than-Zoho:** (1) Slack/Webhook delivery in addition to email. (2) Conditional scheduling: "Send AP Aging only if over-90 bucket > ₹0." (3) Run-history log with download links for last 12 runs.
- **Build status:** **New.**

---

### M3. Period-Close Report Packs

- **Purpose:** On month/quarter/year close, automatically snapshot and bundle all key reports into a period-close pack (PDF bundle) for audit and board review.
- **Zoho Books behaviour:** Not a native feature; users manually export each report.
- **Data model / query:**
  ```sql
  -- report_snapshots table
  CREATE TABLE report_snapshots (
    id          CHAR(36) PRIMARY KEY,
    org_id      CHAR(36) NOT NULL,
    report_key  VARCHAR(100) NOT NULL,
    period      VARCHAR(20) NOT NULL,   -- e.g. '2026-06'
    params      JSON NOT NULL,
    payload     LONGTEXT NOT NULL,      -- JSON report data
    sha256_hash CHAR(64) NOT NULL,      -- tamper evidence
    audit_entry_id CHAR(36),           -- FK to audit_ledger
    created_at  DATETIME DEFAULT NOW()
  );
  ```
  Period-close trigger: POST `/api/period-close` → runs all standard reports for the closed period, inserts to `report_snapshots`, computes SHA-256, writes to audit ledger, bundles PDFs, stores in MinIO, emails to admins.
- **API (contract-first):**
  ```
  POST /api/period-close
  Body: { period: '2026-06', report_keys?: string[] }
  GET  /api/report-snapshots?period=&report_key=
  GET  /api/report-snapshots/:id/download
  ```
- **Rendering:** Period-close workflow page: select period → preview reports included → confirm close → progress indicator → download pack. Historical close packs accessible in archive.
- **Automations:** Auto-triggered on period-close accounting action; sends email to finance team.
- **Personalized / better-than-Zoho:** Cryptographic tamper evidence on all snapshots (hash stored in audit ledger) — no equivalent in Zoho. Bundled PDF pack in one download vs manual export per report. Automatic comparison vs prior period included in pack.
- **Build status:** **New.**

---

## Cross-Cutting Concerns

### Natural-Language Query Layer

All reports expose a secondary AI query interface:
- `POST /api/reports/nl-query` — body: `{ question: string }` → AI (Claude claude-sonnet-4-6 via SDK) interprets intent, maps to a report + params, returns structured JSON matching the report's OpenAPI schema + a prose narrative.
- Frontend: a persistent "Ask your data" input bar at the top of the Reports section. Suggested questions chip row.
- Examples: "What was my gross margin last quarter?", "Which customers haven't paid in 90+ days?", "How does this month's revenue compare to the same month last year?"

### Anomaly Detection

- Nightly background job computes rolling statistics (mean, σ) for key metrics: revenue, expenses, AR days, AP days, cash balance.
- Any metric > 2σ from 90-day mean → inserts to `anomaly_alerts(metric, value, expected_range, detected_at)`.
- Dashboard shows anomaly banner with drill-down link to the affected report.
- `GET /api/anomaly-alerts?resolved=false` powers the banner.

### Real-Time KPI Streaming

- `GET /api/dashboard/kpi-stream` — SSE endpoint that pushes delta KPI updates whenever a transaction is committed (invoice created/paid, bill paid, etc.).
- Frontend: `EventSource` hook in TanStack Query integration; KPI cards update in place without full page refresh.

### Report Access Control

- `report_permissions(report_key, role, org_id)` table maps which roles can view each report.
- Every report endpoint checks org-level RBAC before executing.
- Sensitive reports (Audit Trail, General Ledger) restricted to `admin` and `accountant` roles.

---

## Implementation Priority

| Priority | Reports / Features |
|----------|--------------------|
| **P0 (Sprint 1)** | Dashboard upgrades (runway, SSE, AI narrative), P&L, Balance Sheet, Trial Balance |
| **P1 (Sprint 2)** | Cash Flow (direct+indirect), General Ledger, AR Aging (full pages), AP Aging (full pages), Tax Summary |
| **P2 (Sprint 3)** | Sales by Customer/Item/Salesperson, Purchases by Vendor/Item, Vendor/Customer Balance reports, Invoice/Bill Details |
| **P3 (Sprint 4)** | Budget vs Actuals, Business Performance Ratios, Inventory reports, Journal Report, Account Transactions |
| **P4 (Sprint 5)** | Export infrastructure, Scheduled Reports, Period-Close Packs, Audit Trail report UI |
| **P5 (Sprint 6)** | Custom Report Builder, NL Query Layer, Anomaly Detection, Cash Flow Forecast, TDS reports |

---

## DB Schema Notes (New Tables Required)

```sql
-- Budget management
CREATE TABLE budgets (
  id CHAR(36) PRIMARY KEY, org_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL, fiscal_year SMALLINT NOT NULL,
  period_type ENUM('monthly','quarterly','half_yearly','yearly') DEFAULT 'monthly',
  created_by CHAR(36), created_at DATETIME DEFAULT NOW()
);
CREATE TABLE budget_lines (
  id CHAR(36) PRIMARY KEY, budget_id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL, period_start DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  UNIQUE KEY (budget_id, account_id, period_start)
);

-- Report infrastructure
CREATE TABLE report_schedules (
  id CHAR(36) PRIMARY KEY, org_id CHAR(36) NOT NULL,
  report_key VARCHAR(100) NOT NULL, params JSON NOT NULL,
  format ENUM('pdf','xlsx','csv') DEFAULT 'pdf',
  cron_expr VARCHAR(50) NOT NULL, recipients JSON NOT NULL,
  subject VARCHAR(255), is_active BOOLEAN DEFAULT TRUE,
  created_by CHAR(36), created_at DATETIME DEFAULT NOW(),
  last_run_at DATETIME, next_run_at DATETIME
);
CREATE TABLE report_snapshots (
  id CHAR(36) PRIMARY KEY, org_id CHAR(36) NOT NULL,
  report_key VARCHAR(100) NOT NULL, period VARCHAR(20) NOT NULL,
  params JSON NOT NULL, payload LONGTEXT NOT NULL,
  sha256_hash CHAR(64) NOT NULL, audit_entry_id CHAR(36),
  created_at DATETIME DEFAULT NOW()
);
CREATE TABLE kpi_snapshots (
  id CHAR(36) PRIMARY KEY, org_id CHAR(36) NOT NULL,
  snapped_at DATE NOT NULL, payload JSON NOT NULL,
  UNIQUE KEY (org_id, snapped_at)
);
CREATE TABLE anomaly_alerts (
  id CHAR(36) PRIMARY KEY, org_id CHAR(36) NOT NULL,
  metric VARCHAR(100) NOT NULL, value DECIMAL(20,4),
  expected_range JSON, detected_at DATETIME DEFAULT NOW(),
  resolved_at DATETIME, resolved_by CHAR(36)
);
```

---

## MySQL Views (Performance)

```sql
-- AR Aging (refreshed view — no materialization in MySQL; use as view)
CREATE OR REPLACE VIEW v_ar_aging AS
SELECT i.id, i.invoice_number, i.customer_id, c.name AS customer_name,
  i.due_date, i.amount_due,
  DATEDIFF(CURDATE(), i.due_date) AS days_overdue,
  CASE
    WHEN DATEDIFF(CURDATE(), i.due_date) <= 0 THEN 'current'
    WHEN DATEDIFF(CURDATE(), i.due_date) <= 30 THEN '1-30'
    WHEN DATEDIFF(CURDATE(), i.due_date) <= 60 THEN '31-60'
    WHEN DATEDIFF(CURDATE(), i.due_date) <= 90 THEN '61-90'
    ELSE 'over-90'
  END AS bucket
FROM invoices i JOIN customers c ON c.id = i.customer_id
WHERE i.status NOT IN ('paid','cancelled','void') AND i.amount_due > 0;

-- AP Aging (same pattern for bills)
CREATE OR REPLACE VIEW v_ap_aging AS
SELECT b.id, b.bill_number, b.vendor_id, v.name AS vendor_name,
  b.due_date, b.amount_due,
  DATEDIFF(CURDATE(), b.due_date) AS days_overdue,
  CASE
    WHEN DATEDIFF(CURDATE(), b.due_date) <= 0 THEN 'current'
    WHEN DATEDIFF(CURDATE(), b.due_date) <= 30 THEN '1-30'
    WHEN DATEDIFF(CURDATE(), b.due_date) <= 60 THEN '31-60'
    WHEN DATEDIFF(CURDATE(), b.due_date) <= 90 THEN '61-90'
    ELSE 'over-90'
  END AS bucket
FROM bills b JOIN vendors v ON v.id = b.vendor_id
WHERE b.status NOT IN ('paid','cancelled','void') AND b.amount_due > 0;
```
