# 04 — Accountant / General Ledger

**Section of:** Zoho Books → Astram Financial Portal: Feature Blueprint
**Stack:** OpenAPI 3.1 → Orval → TanStack Query + Zod · Drizzle/MariaDB/MySQL2 · Express 5 `/api` · React 19 + Vite + wouter + shadcn/ui · Tamper-evident hash-chain audit ledger

---

## 4. Accountant / General Ledger

### Overview

The GL module is the backbone of the Astram Financial Portal — every sub-ledger (invoices, bills, banking, payroll) eventually posts here. The module covers eight tightly coupled feature areas:

| # | Feature | Build Status |
|---|---------|-------------|
| 4.1 | Chart of Accounts | Partial |
| 4.2 | Manual Journals (double-entry) | Partial |
| 4.3 | Recurring Journals | Partial |
| 4.4 | Opening Balances | New |
| 4.5 | Budgets (vs Actuals) | Partial |
| 4.6 | Currency / FX Adjustments | Partial |
| 4.7 | Transaction Locking / Period Close | Partial |
| 4.8 | General Ledger Drill-down Report | New |
| 4.9 | Bulk Operations | New |
| 4.10 | Accountant Access & Roles | New |
| 4.11 | Chart of Accounts Import | New |

All GL mutations are anchored to the **hash-chain audit ledger** (`audit_log` table with `prev_hash` / `entry_hash`). The chain makes every posted entry tamper-evident — a natural fit for regulatory period-close requirements and SOC-2 readiness.

---

### 4.1 Chart of Accounts

- **Purpose:** Hierarchical taxonomy of every account used in double-entry bookkeeping.

- **Zoho Books behaviour:**
  - Five root account types: `Asset`, `Liability`, `Equity`, `Income`, `Expense`; each with system subtypes (e.g., Asset → Cash, Bank, Fixed Asset, Accounts Receivable, Stock).
  - Up to N levels of parent/child accounts (`parent_account_id`).
  - System accounts cannot be deleted or deactivated; only manually-created accounts can.
  - Accounts with existing transactions cannot be deleted.
  - Account code can be made mandatory and must be unique (preference setting).
  - Accounts can be pinned to the dashboard widget.
  - Files (invoices, receipts) can be attached to any account for audit.
  - Import via CSV/TSV/XLS (max 10 MB); duplicates handled by skip or overwrite.
  - Bulk activate / bulk deactivate / bulk delete (manually-created only).
  - `filter_by`: All, Active, Inactive, Asset, Liability, Equity, Income, Expense.
  - `showbalance` param returns live `current_balance` in each account.

- **Data model:**
  ```ts
  // drizzle schema (mysql2)
  export const accounts = mysqlTable('accounts', {
    id:               int('id').autoincrement().primaryKey(),
    orgId:            int('org_id').notNull(),
    accountName:      varchar('account_name', { length: 255 }).notNull(),
    accountCode:      varchar('account_code', { length: 50 }),
    accountType:      varchar('account_type', { length: 50 }).notNull(),
    // 'asset'|'liability'|'equity'|'income'|'expense'
    accountSubtype:   varchar('account_subtype', { length: 80 }),
    // e.g. 'cash','bank','fixed_asset','accounts_receivable','stock',
    //      'accounts_payable','credit_card','long_term_liability',
    //      'other_current_liability','other_asset','other_current_asset'
    parentAccountId:  int('parent_account_id'),   // no FK — app-enforced
    currencyId:       int('currency_id'),
    description:      text('description'),
    isSystemAccount:  boolean('is_system_account').default(false),
    isActive:         boolean('is_active').default(true),
    showOnDashboard:  boolean('show_on_dashboard').default(false),
    includeInVatReturn: boolean('include_in_vat_return').default(false),
    customFields:     customJson('custom_fields'),  // app-level JSON type
    createdAt:        timestamp('created_at').defaultNow(),
    updatedAt:        timestamp('updated_at').onUpdateNow(),
  });
  ```

- **API (contract-first):**
  ```
  GET    /api/accounts                        list; ?filter_by, ?search_text, ?showbalance, ?sort_column, ?page, ?per_page
  POST   /api/accounts                        create → mutate INSERT then SELECT by lastInsertId
  GET    /api/accounts/:id                    single account with balance
  PUT    /api/accounts/:id                    update → mutate then SELECT
  DELETE /api/accounts/:id                    soft-delete guard: reject if is_system_account or has transactions
  POST   /api/accounts/:id/activate           set is_active=true → SELECT
  POST   /api/accounts/:id/deactivate         set is_active=false → SELECT
  POST   /api/accounts/bulk/activate          body: { ids: number[] }
  POST   /api/accounts/bulk/deactivate        body: { ids: number[] }
  DELETE /api/accounts/bulk                   body: { ids: number[] } — rejects system/transacted accounts
  GET    /api/accounts/:id/transactions       account transaction ledger lines; ?date_start, ?date_end, ?page
  POST   /api/accounts/import                 multipart CSV/TSV/XLS; body: { on_duplicate: 'skip'|'overwrite' }
  ```
  Response shape: `{ account: AccountDto }` / `{ accounts: AccountDto[], page_context: PageContextDto }`.
  MySQL has no RETURNING: every mutating route executes `INSERT/UPDATE`, then `SELECT WHERE id = lastInsertId` (or passed `:id`).

- **Workflow / state machine:**
  ```
  NEW ──create──► ACTIVE ──deactivate──► INACTIVE
                  │                        │
                  └────────activate─────────┘
  ACTIVE (system) → immutable (no deactivate/delete)
  ACTIVE (has txns) → no delete (edit/deactivate allowed)
  ```

- **Automations:**
  - On invoice/bill/payment post: sub-ledger controller calls `postToGL(accountId, amount, debitOrCredit)` which inserts a `gl_lines` row and appends an audit-chain entry.
  - `showbalance=true` computes `SUM(debit) - SUM(credit)` on `gl_lines` at query time (indexed on `account_id`).
  - Webhook emitted on account create/update: `account.created`, `account.updated`.

- **Personalized / better-than-Zoho:**
  - **Zod refinement** on account code uniqueness enforced before DB hit (400 with field-level error, not generic DB error).
  - **Hash-chain anchor:** every create/update appends a signed audit entry — full account lineage is tamper-evident.
  - **AI classification assist:** when creating a new account, LLM suggests `accountType` + `accountSubtype` from free-text name (sidebar hint, user confirms).
  - **UX:** live balance column in CoA table with sparkline; tree view with collapsible parent groups; keyboard shortcut to "jump to account" from any journal line.

- **Build status:** Partial (create/list/edit exist; subtypes, parent hierarchy, import, bulk ops, account-transactions endpoint are New).

---

### 4.2 Manual Journals

- **Purpose:** Record ad-hoc double-entry transactions (depreciation, accruals, error corrections, inter-account transfers) outside normal sales/purchase flows.

- **Zoho Books behaviour:**
  - Each journal has N line items; sum of debits **must equal** sum of credits (system rejects otherwise).
  - Statuses: `draft` → `pending_approval` → `approved` → `published`; or `rejected` from `pending_approval`.
  - Approvals are optional (preference-controlled); when off, journals go `draft` → `published` directly.
  - `journal_type`: `accrual`, `cash`, `both` (controls which reporting method includes this entry).
  - Reverse journal: system auto-creates a mirror journal with opposite debit/credit, dated at reversal date.
  - Clone: duplicate a journal to a new date.
  - Bulk: publish, print, delete.
  - Custom fields, notes, reference number, attachments.
  - Activity log tracks creation, edits, status changes, approvals.
  - Import/export: CSV, XLS, XLSX (password-protected export).
  - Validation rules: configurable field-level rules (e.g., require reference number for Expense accounts).
  - Period-lock enforcement: cannot create/edit/delete a journal dated ≤ lock date.
  - 13th-month adjustment journals: period-end entries that appear only in a dedicated 13th-month trial balance, not in the standard 12-month P&L.

- **Data model:**
  ```ts
  export const manualJournals = mysqlTable('manual_journals', {
    id:              int('id').autoincrement().primaryKey(),
    orgId:           int('org_id').notNull(),
    journalNumber:   varchar('journal_number', { length: 50 }).notNull(),
    journalDate:     date('journal_date').notNull(),
    referenceNumber: varchar('reference_number', { length: 100 }),
    journalType:     varchar('journal_type', { length: 20 }).default('both'),
    // 'accrual'|'cash'|'both'
    status:          varchar('status', { length: 30 }).default('draft'),
    // 'draft'|'pending_approval'|'approved'|'rejected'|'published'
    notes:           text('notes'),
    currencyId:      int('currency_id'),
    exchangeRate:    decimal('exchange_rate', { precision: 15, scale: 6 }).default('1.000000'),
    totalDebit:      decimal('total_debit', { precision: 15, scale: 2 }).notNull(),
    totalCredit:     decimal('total_credit', { precision: 15, scale: 2 }).notNull(),
    isReversed:      boolean('is_reversed').default(false),
    reversalJournalId: int('reversal_journal_id'),
    recurringJournalId: int('recurring_journal_id'),
    is13thMonth:     boolean('is_13th_month').default(false),
    customFields:    customJson('custom_fields'),
    auditHash:       varchar('audit_hash', { length: 64 }),  // chain link
    createdBy:       int('created_by').notNull(),
    approvedBy:      int('approved_by'),
    createdAt:       timestamp('created_at').defaultNow(),
    updatedAt:       timestamp('updated_at').onUpdateNow(),
  });

  export const journalLineItems = mysqlTable('journal_line_items', {
    id:             int('id').autoincrement().primaryKey(),
    journalId:      int('journal_id').notNull(),
    itemOrder:      int('item_order').notNull(),
    accountId:      int('account_id').notNull(),
    contactId:      int('contact_id'),
    debitOrCredit:  varchar('debit_or_credit', { length: 6 }).notNull(), // 'debit'|'credit'
    amount:         decimal('amount', { precision: 15, scale: 2 }).notNull(),
    bcyAmount:      decimal('bcy_amount', { precision: 15, scale: 2 }),
    taxId:          int('tax_id'),
    description:    text('description'),
    projectId:      int('project_id'),
    locationId:     int('location_id'),
    reportingTags:  customJson('reporting_tags'),
    createdAt:      timestamp('created_at').defaultNow(),
  });
  ```

- **API (contract-first):**
  ```
  GET    /api/journals                  list; ?status, ?date_start, ?date_end, ?account_id, ?journal_type, ?search, ?page, ?per_page
  POST   /api/journals                  create (draft or published per pref) → INSERT header + lines, SELECT by lastInsertId
  GET    /api/journals/:id              single with line_items[]
  PUT    /api/journals/:id              update (only draft/rejected) → UPDATE then SELECT
  DELETE /api/journals/:id              only draft (not published)
  POST   /api/journals/:id/submit       draft → pending_approval
  POST   /api/journals/:id/approve      pending_approval → approved
  POST   /api/journals/:id/reject       pending_approval → rejected; body: { reason: string }
  POST   /api/journals/:id/publish      approved (or draft if no-approval) → published; appends audit chain entry
  POST   /api/journals/:id/reverse      creates mirror journal; body: { reversal_date: string }
  POST   /api/journals/:id/clone        clones to new date; body: { journal_date: string }
  POST   /api/journals/bulk/publish     body: { ids: number[] }
  DELETE /api/journals/bulk             body: { ids: number[] } — drafts only
  GET    /api/journals/templates        list saved templates
  POST   /api/journals/import           multipart CSV/XLS
  GET    /api/journals/:id/activity     audit trail for this journal
  ```

- **Workflow / state machine:**
  ```
  DRAFT ──submit──► PENDING_APPROVAL ──approve──► APPROVED ──publish──► PUBLISHED
    │                      │                                               │
    │                   reject                                         reverse──► REVERSED
    │                      ▼                                               
    ◄──────────────── REJECTED                                          
    │
    └──publish (no-approval mode)──► PUBLISHED
  ```
  Period-lock gate applied at every write transition: if `journal_date ≤ lock_date` for Accounts module → 409 Conflict.

- **Automations:**
  - On `published`: iterate line items, call `postToGL(accountId, amount, debitOrCredit, journalId)` inside a transaction; on success append hash-chain audit entry linking `journal_id`.
  - On `reverse`: POST to create new journal with negated amounts, status `published`; mark original `is_reversed=true`.
  - Nightly anomaly job: flag journals where a single line item > 3σ of account's 90-day average; surface in UI as "Needs Review" badge.

- **Personalized / better-than-Zoho:**
  - **Zod refinement:** `line_items` array validated with `.refine(items => sum(debits) === sum(credits), 'Debits must equal credits')` — rejected at API boundary before any DB write; specific error pinpoints the off-by amount.
  - **Hash chain:** publishing a journal appends an immutable `audit_log` entry signed with `SHA-256(prevHash + journalId + totalDebit + totalCredit + timestamp)`.
  - **AI anomaly flag:** GPT/Claude assistant reviews the narration + accounts and flags unusual combinations (e.g., crediting Revenue from an Expense account).
  - **UX:** real-time debit/credit balance indicator in the line-item table (green = balanced, red = off by X); keyboard-driven row entry (Tab through columns, Enter to add row).
  - **Period-lock UX:** instead of a generic 403, show a modal explaining exactly which lock date applies and who set it, with a link to the lock settings page.

- **Build status:** Partial (create/list/post exist; approval workflow, reverse, 13th-month, anomaly detection, clone are New).

---

### 4.3 Recurring Journals

- **Purpose:** Auto-generate manual journal entries on a defined schedule to eliminate repetitive manual entry (depreciation, rent, subscriptions, accruals).

- **Zoho Books behaviour:**
  - A "profile" defines: profile name, frequency, start date, end date, draft-vs-published default, line items (same structure as manual journal).
  - Frequency options: daily, weekly, bi-weekly, monthly, quarterly, half-yearly, yearly, or custom interval.
  - Each scheduled run creates a "child journal" linked to the profile; child journals appear in the Manual Journals list.
  - If start date is in the past, past-period child journals are **not** back-created — future runs only.
  - Profiles can be paused/resumed; end date can be open-ended or fixed.
  - Custom fields and reporting tags carried through to each child.
  - Cloning a profile's details into a one-time manual journal is supported.
  - Child journals can be independently edited (draft) or deleted after creation.
  - Auto-post preference: child journals can be created as `draft` (manual review) or `published` (fire-and-forget).

- **Data model:**
  ```ts
  export const recurringJournalProfiles = mysqlTable('recurring_journal_profiles', {
    id:              int('id').autoincrement().primaryKey(),
    orgId:           int('org_id').notNull(),
    profileName:     varchar('profile_name', { length: 255 }).notNull(),
    status:          varchar('status', { length: 20 }).default('active'),
    // 'active'|'paused'|'expired'|'stopped'
    frequency:       varchar('frequency', { length: 30 }).notNull(),
    // 'daily'|'weekly'|'biweekly'|'monthly'|'quarterly'|'half_yearly'|'yearly'|'custom'
    customIntervalDays: int('custom_interval_days'),  // if frequency='custom'
    startDate:       date('start_date').notNull(),
    endDate:         date('end_date'),               // null = no end
    nextRunDate:     date('next_run_date').notNull(),
    autoPublish:     boolean('auto_publish').default(false),
    notes:           text('notes'),
    currencyId:      int('currency_id'),
    exchangeRate:    decimal('exchange_rate', { precision: 15, scale: 6 }).default('1.000000'),
    lineItems:       customJson('line_items').notNull(),  // array of {accountId, debitOrCredit, amount, description, taxId, reportingTags}
    customFields:    customJson('custom_fields'),
    createdBy:       int('created_by').notNull(),
    createdAt:       timestamp('created_at').defaultNow(),
    updatedAt:       timestamp('updated_at').onUpdateNow(),
  });
  ```
  Child journals reference `recurringJournalId` in `manual_journals`.

- **API (contract-first):**
  ```
  GET    /api/recurring-journals                list profiles; ?status, ?page, ?per_page
  POST   /api/recurring-journals                create profile → INSERT then SELECT
  GET    /api/recurring-journals/:id            single profile + recent child journals
  PUT    /api/recurring-journals/:id            update profile (name, frequency, line items, end date)
  POST   /api/recurring-journals/:id/pause      status → paused
  POST   /api/recurring-journals/:id/resume     status → active; recalculate next_run_date
  DELETE /api/recurring-journals/:id            stop profile (does not delete child journals)
  GET    /api/recurring-journals/:id/journals   list child journals for this profile; ?page
  POST   /api/recurring-journals/:id/run-now    manual trigger for testing → creates child journal immediately
  ```

- **Workflow / state machine:**
  ```
  ACTIVE ──pause──► PAUSED ──resume──► ACTIVE
  ACTIVE ──end_date_reached──► EXPIRED
  ACTIVE ──delete──► STOPPED
  Scheduler: every day at midnight UTC — SELECT * WHERE status='active' AND next_run_date <= TODAY
    → for each: create child manual_journal (draft or published), advance next_run_date
  ```

- **Automations:**
  - **Cron job** (`cron: '0 0 * * *'`): scans active profiles with `next_run_date <= today`; creates child journals via the same service layer as manual journal creation; increments `next_run_date`; posts to GL if `auto_publish=true`.
  - If `auto_publish=true` and period is locked, child journal is created as `draft` with a system note "Auto-publish skipped: period locked" — never silently dropped.
  - Webhook: `recurring_journal.created` fired per child journal created.

- **Personalized / better-than-Zoho:**
  - **Zod refinement** on profile creation validates `line_items` balance (debits = credits) at API layer — same as manual journal.
  - **Dry-run preview:** `POST /api/recurring-journals/:id/preview?date=YYYY-MM-DD` returns the would-be child journal without writing it — useful for accountant sign-off before enabling auto-publish.
  - **Smart frequency detection:** pasting a natural-language description ("first Monday of every month") into the profile name triggers an AI suggestion for the correct frequency setting.
  - **Hash chain:** each auto-created child journal appended to hash chain identically to manually-created journals.

- **Build status:** Partial (basic recurring model exists; pause/resume, dry-run, period-lock guard on auto-publish are New).

---

### 4.4 Opening Balances

- **Purpose:** Bootstrap the GL with accurate balances when migrating from a prior accounting system, ensuring continuity from the migration cut-over date.

- **Zoho Books behaviour:**
  - Set in Settings → Opening Balances; requires an **opening balance date** (migration date).
  - Accounts: AR, AP, Assets, Liabilities, Bank/Credit Card, Equity, Income, Expense — all supported.
  - Three methods:
    1. Import CSV/TSV/XLS with account ID + debit/credit amount.
    2. Import contacts (customers/vendors) with outstanding balances simultaneously.
    3. Manual entry per account.
  - If debits ≠ credits, the difference auto-posts to an **"Opening Balance Adjustment"** equity account.
  - "Sync" option: allows recording transactions dated *before* the opening balance date; system re-computes the adjustment on sync.
  - After entering balances, normal transactions from the opening date onward are recorded as usual.
  - Opening balance entries appear in the GL as a special transaction type for auditability.

- **Data model:**
  ```ts
  export const openingBalances = mysqlTable('opening_balances', {
    id:              int('id').autoincrement().primaryKey(),
    orgId:           int('org_id').notNull(),
    openingDate:     date('opening_date').notNull(),
    accountId:       int('account_id').notNull(),
    debitAmount:     decimal('debit_amount', { precision: 15, scale: 2 }).default('0.00'),
    creditAmount:    decimal('credit_amount', { precision: 15, scale: 2 }).default('0.00'),
    currencyId:      int('currency_id'),
    exchangeRate:    decimal('exchange_rate', { precision: 15, scale: 6 }).default('1.000000'),
    notes:           text('notes'),
    isSynced:        boolean('is_synced').default(false),
    createdAt:       timestamp('created_at').defaultNow(),
    updatedAt:       timestamp('updated_at').onUpdateNow(),
  });

  export const openingBalanceSettings = mysqlTable('opening_balance_settings', {
    id:              int('id').autoincrement().primaryKey(),
    orgId:           int('org_id').notNull(),
    openingDate:     date('opening_date').notNull(),
    isConfirmed:     boolean('is_confirmed').default(false),
    adjustmentAccountId: int('adjustment_account_id'), // auto-created equity account
    importedAt:      timestamp('imported_at'),
    confirmedAt:     timestamp('confirmed_at'),
    confirmedBy:     int('confirmed_by'),
    updatedAt:       timestamp('updated_at').onUpdateNow(),
  });
  ```

- **API (contract-first):**
  ```
  GET    /api/opening-balances/settings         org's opening balance date + confirmation status
  PUT    /api/opening-balances/settings         set/update opening date (only before confirmation)
  GET    /api/opening-balances                  list all account opening balance rows; ?account_type
  PUT    /api/opening-balances/:accountId       set/update debit+credit for account → mutate then SELECT
  POST   /api/opening-balances/import           multipart CSV/TSV/XLS upload
  POST   /api/opening-balances/sync             re-computes adjustment account; body: {}
  POST   /api/opening-balances/confirm          lock the opening balance — creates GL seed entries; appends hash-chain entries per account
  GET    /api/opening-balances/summary          totals: total_debit, total_credit, adjustment_amount
  ```

- **Workflow / state machine:**
  ```
  UNSET ──set_date──► DRAFT ──enter_balances──► IN_PROGRESS
  IN_PROGRESS ──sync──► ADJUSTED (adjustment account balanced)
  ADJUSTED / IN_PROGRESS ──confirm──► CONFIRMED (immutable; GL seeds created)
  ```
  Once CONFIRMED, opening balances cannot be edited; a new manual journal must be used for corrections.

- **Automations:**
  - On `confirm`: service iterates all `opening_balances` rows, bulk-inserts into `gl_lines` with `transaction_type='opening_balance'`, then auto-creates the Opening Balance Adjustment journal entry if `SUM(debit) ≠ SUM(credit)`.
  - Adjustment account auto-created under Equity type as "Opening Balance Adjustments" if it doesn't exist.
  - Audit chain entry appended per GL seed row.

- **Personalized / better-than-Zoho:**
  - **Live balance indicator:** real-time total debit / total credit / adjustment amount shown in the opening-balance entry form — accountant sees the plug amount before confirming.
  - **Trial balance pre-check:** before import confirmation, system generates a draft trial balance matching the opening date, allowing the accountant to verify against their previous system's TB printout.
  - **Import validation:** Zod parses every CSV row client-side before upload; mismatched account codes reported with row numbers before the file is submitted.
  - **Hash chain:** confirmation event writes an immutable chain entry per seeded GL line.

- **Build status:** New.

---

### 4.5 Budgets (vs Actuals)

- **Purpose:** Set account-level financial targets by period, then compare forecasted vs actual performance with variance reporting across P&L, Balance Sheet, and Cash Flow.

- **Zoho Books behaviour:**
  - Budget created per fiscal year; name + fiscal year + period granularity (monthly / quarterly / half-yearly / yearly).
  - Account selection: Income and Expense accounts required; Assets, Liabilities, Equity optional (via checkbox).
  - Reporting tags can scope a budget to a dimension (department, project, location).
  - Auto-fill strategies: fixed amount per period; amount-based adjustment (add X to each cell or to existing); percentage-based (grow/shrink by Y% from first period or existing).
  - Budget vs Actuals report: P&L view, Balance Sheet view, Cash Flow view; shows budget, actual, variance (absolute + %), period-by-period.
  - Filter by budget name, account type (All, Budget Accounts, Accounts with Transactions, Budget Accounts OR Accounts with Transactions).
  - When a Balance Sheet budget doesn't balance, a "Budget Mismatch Account" absorbs the difference.

- **Data model:**
  ```ts
  export const budgets = mysqlTable('budgets', {
    id:            int('id').autoincrement().primaryKey(),
    orgId:         int('org_id').notNull(),
    budgetName:    varchar('budget_name', { length: 255 }).notNull(),
    fiscalYear:    varchar('fiscal_year', { length: 9 }).notNull(), // e.g. '2025-2026'
    period:        varchar('period', { length: 20 }).notNull(),
    // 'monthly'|'quarterly'|'half_yearly'|'yearly'
    includeAssets:     boolean('include_assets').default(false),
    includeLiabilities: boolean('include_liabilities').default(false),
    includeEquity:     boolean('include_equity').default(false),
    reportingTagId: int('reporting_tag_id'),
    createdBy:     int('created_by').notNull(),
    createdAt:     timestamp('created_at').defaultNow(),
    updatedAt:     timestamp('updated_at').onUpdateNow(),
  });

  export const budgetLines = mysqlTable('budget_lines', {
    id:         int('id').autoincrement().primaryKey(),
    budgetId:   int('budget_id').notNull(),
    accountId:  int('account_id').notNull(),
    periodStart: date('period_start').notNull(),  // first day of each budget period
    periodEnd:   date('period_end').notNull(),
    budgeted:   decimal('budgeted', { precision: 15, scale: 2 }).default('0.00'),
    createdAt:  timestamp('created_at').defaultNow(),
    updatedAt:  timestamp('updated_at').onUpdateNow(),
  });
  ```

- **API (contract-first):**
  ```
  GET    /api/budgets                       list budgets; ?fiscal_year, ?page
  POST   /api/budgets                       create budget header → INSERT then SELECT
  GET    /api/budgets/:id                   single budget with lines[]
  PUT    /api/budgets/:id                   update header fields
  DELETE /api/budgets/:id                   delete budget + all lines
  PUT    /api/budgets/:id/lines             bulk upsert all budget lines for the budget (period × account matrix)
  POST   /api/budgets/:id/autofill          body: { strategy: 'fixed'|'amount_adjust'|'pct_adjust', value: number, apply_to: 'first'|'existing' }
  GET    /api/budgets/:id/vs-actuals        body/query: ?report_type=pnl|balance_sheet|cashflow, ?period_start, ?period_end
                                            response: { lines: [{ account, budgeted, actual, variance, variance_pct }] }
  ```
  `vs-actuals` query: JOINs `budget_lines` with aggregated `gl_lines` grouped by `account_id` + period; all within Express, no stored procedure.

- **Workflow / state machine:**
  Budgets are simple CRUD with no approval state; there is no "closed" budget — a fiscal year budget exists until deleted.

- **Automations:**
  - Budget vs Actuals is a **live report** computed at query time; no materialization needed for typical org sizes (< 10k GL lines/month).
  - Nightly alerting job: for each active budget, compare actuals to budget for current period; if `actual > budgeted * 1.1` (overrun threshold), emit `budget.overrun` webhook and in-app notification to accountant role users.
  - Alert thresholds configurable per budget (default 110%).

- **Personalized / better-than-Zoho:**
  - **Variance sparkline:** period-level variance trend shown inline in the budget lines table (tiny bar chart per row) — not available in Zoho.
  - **Budget vs Actuals as a TanStack Query live view:** auto-refetches on journal publish so the accountant sees real-time actuals while working.
  - **AI forecast:** "Predict full-year actuals" button sends current-period actuals + historical GL data to AI; returns projected year-end values overlaid on budget; clearly labeled as estimate.
  - **Zod validation:** budget lines matrix validated for completeness (all periods × all selected accounts populated) before save.

- **Build status:** Partial (budget create/list exists; autofill, vs-actuals report, overrun alerting are New).

---

### 4.6 Currency / FX Adjustments

- **Purpose:** Revalue open foreign-currency balances at updated exchange rates to recognize unrealized gains/losses at period-end.

- **Zoho Books behaviour:**
  - Navigate to Accountant → Base Currency Adjustments → + Make an Adjustment.
  - Select foreign currency, set adjustment date, enter new exchange rate.
  - System identifies all open (unpaid/partially-paid) transactions in that currency (invoices, bills, bank balances).
  - Calculates unrealized gain/loss = (new rate − original rate) × open balance.
  - Creates a journal entry: debit/credit the relevant asset/liability account; offset to "Unrealized Gain/Loss" income/expense account.
  - Currency Report shows unrealized gain/loss per currency per account.
  - Open transactions are mandatory — adjustment fails if none exist.
  - Reversal: adjustment journals can be reversed when the transaction closes (converting unrealized to realized).

- **Data model:**
  ```ts
  export const currencyAdjustments = mysqlTable('currency_adjustments', {
    id:               int('id').autoincrement().primaryKey(),
    orgId:            int('org_id').notNull(),
    currencyId:       int('currency_id').notNull(),
    adjustmentDate:   date('adjustment_date').notNull(),
    newExchangeRate:  decimal('new_exchange_rate', { precision: 15, scale: 6 }).notNull(),
    status:           varchar('status', { length: 20 }).default('posted'),
    // 'posted'|'reversed'
    gainLossAmount:   decimal('gain_loss_amount', { precision: 15, scale: 2 }),
    gainLossAccountId: int('gain_loss_account_id'),  // Unrealized Gain/Loss account
    linkedJournalId:  int('linked_journal_id'),      // created manual journal
    reversalJournalId: int('reversal_journal_id'),
    notes:            text('notes'),
    createdBy:        int('created_by').notNull(),
    createdAt:        timestamp('created_at').defaultNow(),
    updatedAt:        timestamp('updated_at').onUpdateNow(),
  });

  export const currencyAdjustmentLines = mysqlTable('currency_adjustment_lines', {
    id:              int('id').autoincrement().primaryKey(),
    adjustmentId:    int('adjustment_id').notNull(),
    accountId:       int('account_id').notNull(),
    transactionType: varchar('transaction_type', { length: 50 }),
    transactionId:   int('transaction_id'),
    originalRate:    decimal('original_rate', { precision: 15, scale: 6 }).notNull(),
    newRate:         decimal('new_rate', { precision: 15, scale: 6 }).notNull(),
    fcyBalance:      decimal('fcy_balance', { precision: 15, scale: 2 }).notNull(),
    originalBcyBalance: decimal('original_bcy_balance', { precision: 15, scale: 2 }).notNull(),
    revaluedBcyBalance: decimal('revalued_bcy_balance', { precision: 15, scale: 2 }).notNull(),
    gainLoss:        decimal('gain_loss', { precision: 15, scale: 2 }).notNull(),
    createdAt:       timestamp('created_at').defaultNow(),
  });

  export const exchangeRates = mysqlTable('exchange_rates', {
    id:           int('id').autoincrement().primaryKey(),
    orgId:        int('org_id').notNull(),
    currencyId:   int('currency_id').notNull(),
    effectiveDate: date('effective_date').notNull(),
    rate:         decimal('rate', { precision: 15, scale: 6 }).notNull(),
    source:       varchar('source', { length: 30 }).default('manual'), // 'manual'|'api_auto'
    createdAt:    timestamp('created_at').defaultNow(),
  });
  ```

- **API (contract-first):**
  ```
  GET    /api/currency-adjustments                   list; ?currency_id, ?date_start, ?date_end
  POST   /api/currency-adjustments/preview           compute unrealized gain/loss without posting; body: { currency_id, adjustment_date, new_rate }
                                                     response: { lines: [...], total_gain_loss }
  POST   /api/currency-adjustments                   post adjustment → creates linked journal → appends audit chain; mutate then SELECT
  GET    /api/currency-adjustments/:id               single + lines[]
  POST   /api/currency-adjustments/:id/reverse       reverse the linked journal; status → reversed
  GET    /api/exchange-rates                          list historical rates; ?currency_id, ?date_start, ?date_end
  POST   /api/exchange-rates                         add manual rate snapshot → mutate then SELECT
  GET    /api/exchange-rates/latest                   latest rate per currency
  GET    /api/reports/currency                        unrealized gain/loss report; ?currency_id, ?as_of_date
  ```

- **Workflow / state machine:**
  ```
  PREVIEW (no DB write) → POST → POSTED → REVERSED
  On POST: fetch open transactions in currency, compute gain/loss per line,
           create manual_journal with auto-calculated lines, set status=published,
           insert currency_adjustment + lines, update gl_lines, append hash chain.
  On REVERSE: create reversal journal on adjustment_date + 1 day, set status=reversed.
  ```

- **Automations:**
  - **Scheduled FX rate refresh:** nightly cron job fetches rates from a free exchange rate API (e.g., open.er-api.com) and inserts into `exchange_rates` with `source='api_auto'`; does not auto-post adjustments (accountant must explicitly post).
  - **Period-end prompt:** when transaction lock is being set, if open FCY transactions exist, UI prompts the accountant to run FX adjustment before locking.

- **Personalized / better-than-Zoho:**
  - **Preview-before-post** (New): compute and display the full gain/loss breakdown per account/transaction before any write — Zoho lacks this step.
  - **Rate history chart:** sparkline of exchange rate over the selected currency's history, shown in the adjustment form sidebar.
  - **Hash chain:** every posted adjustment creates an immutable chain entry.
  - **Zod validation:** `new_exchange_rate` must be positive, non-zero; `adjustment_date` must be ≥ earliest open transaction date.

- **Build status:** Partial (currency adjustment model exists; preview endpoint, exchange rate auto-refresh, period-end prompt are New).

---

### 4.7 Transaction Locking / Period Close

- **Purpose:** Freeze a completed accounting period so no transactions can be added, edited, or deleted within that period — supports audit readiness, tax filing, and year-end close.

- **Zoho Books behaviour:**
  - Two modes:
    1. **Lock All**: single lock date applied to every module simultaneously.
    2. **Per-Module Lock**: independent lock dates for Sales, Purchases, Banking, Accounts (journals/tax payments/currency adjustments).
  - Once locked, any attempt to create/modify/delete a transaction dated ≤ lock date is rejected.
  - Lock can be edited (change lock date) or removed (unlock) by admin only.
  - **Partial unlock**: temporarily unlock a date range within a locked period to fix specific errors; restricted for inventory-linked transactions (prevents COGS cascade issues).
  - Cannot lock if negative inventory exists (sales before corresponding purchases).
  - Cannot lock Accounts module while Purchases module is unlocked (COGS dependency).
  - Cannot partially unlock inventory-tracked items.
  - Lock reason can be recorded (e.g., "FY 2024-25 year-end close").

- **Data model:**
  ```ts
  export const transactionLocks = mysqlTable('transaction_locks', {
    id:          int('id').autoincrement().primaryKey(),
    orgId:       int('org_id').notNull(),
    lockModule:  varchar('lock_module', { length: 30 }).notNull(),
    // 'all'|'sales'|'purchases'|'banking'|'accounts'
    lockDate:    date('lock_date').notNull(),
    lockReason:  text('lock_reason'),
    isActive:    boolean('is_active').default(true),
    setBy:       int('set_by').notNull(),
    setAt:       timestamp('set_at').defaultNow(),
    removedBy:   int('removed_by'),
    removedAt:   timestamp('removed_at'),
    updatedAt:   timestamp('updated_at').onUpdateNow(),
  });

  export const partialUnlocks = mysqlTable('partial_unlocks', {
    id:          int('id').autoincrement().primaryKey(),
    orgId:       int('org_id').notNull(),
    lockModule:  varchar('lock_module', { length: 30 }).notNull(),
    unlockFrom:  date('unlock_from').notNull(),
    unlockTo:    date('unlock_to').notNull(),
    reason:      text('reason'),
    isActive:    boolean('is_active').default(true),
    createdBy:   int('created_by').notNull(),
    createdAt:   timestamp('created_at').defaultNow(),
    expiresAt:   timestamp('expires_at'),  // optional auto-expiry
  });
  ```

- **API (contract-first):**
  ```
  GET    /api/transaction-locks              current locks per module; response: { locks: [{ module, lock_date, is_active }] }
  POST   /api/transaction-locks             set lock; body: { lock_module, lock_date, lock_reason } → INSERT then SELECT; runs pre-lock checks
  PUT    /api/transaction-locks/:id         change lock date / reason → UPDATE then SELECT
  DELETE /api/transaction-locks/:id         remove lock (admin only)
  GET    /api/transaction-locks/check       check if a given date+module is locked; ?module, ?date → { is_locked: bool, lock_date, reason }
  POST   /api/transaction-locks/partial-unlock   body: { lock_module, unlock_from, unlock_to, reason }
  DELETE /api/partial-unlocks/:id                remove partial unlock
  GET    /api/transaction-locks/period-close-checklist   returns checklist: unreconciled banks, open FX, unposted journals, unapproved entries
  ```

- **Workflow / state machine:**
  ```
  UNLOCKED ──set_lock──► LOCKED ──edit_lock_date──► LOCKED (new date)
  LOCKED ──remove_lock──► UNLOCKED
  LOCKED ──partial_unlock──► PARTIALLY_UNLOCKED (date window)
  PARTIALLY_UNLOCKED ──remove_partial──► LOCKED
  ```
  Pre-lock validation gate:
  - Negative inventory check (if inventory module enabled).
  - Open foreign-currency transactions → recommend FX adjustment first.
  - Unposted manual journals → warn.
  - Purchases must be locked before Accounts can be locked (COGS guard).

- **Automations:**
  - Lock check middleware: every mutating API endpoint (`POST/PUT/DELETE`) in Sales, Purchases, Banking, Accounts modules calls `isLocked(orgId, module, transactionDate)` before processing; returns 409 with lock detail if blocked.
  - Partial unlock auto-expiry: cron job checks `expires_at` on `partial_unlocks`; deactivates expired rows.
  - **Period-close checklist** (New): computed at query time from live DB — shows: unreconciled bank statements, open invoices/bills, unpaid VAT liabilities, unposted recurring journals, unapproved manual journals.
  - Webhook: `transaction_lock.set`, `transaction_lock.removed` for integrations.

- **Personalized / better-than-Zoho:**
  - **Period-close checklist** (New): step-by-step guided close workflow — accountant works through each checklist item; items marked complete as the underlying data resolves.
  - **Hash-chain lock entry:** setting a lock appends an immutable audit-chain entry with the lock date, module, and user — cannot be silently removed.
  - **Partial unlock expiry:** auto-expiry on partial unlocks (Zoho requires manual removal) — reduces risk of locks being permanently opened.
  - **UX:** locked period dates highlighted in a calendar heatmap on the dashboard; any transaction form shows a banner "⚠ Period locked from X" if the selected date is in a locked range.

- **Build status:** Partial (basic lock exists; per-module locking, partial unlock, period-close checklist, pre-lock checks are New).

---

### 4.8 General Ledger Drill-down Report

- **Purpose:** Account-level ledger view showing every transaction affecting an account, with opening/closing balances, filterable by date range — the primary tool for GL investigation and audit.

- **Zoho Books behaviour:**
  - Found under Reports → Accountant → General Ledger.
  - Shows opening balance for each account as of report start date, then a row per transaction, then closing balance.
  - No row limit — all transactions included.
  - Export: CSV, PDF, XLS; large exports processed in background with download notification.
  - Date range filter (custom, fiscal year, quarter, month presets).
  - Detailed General Ledger: one section per account; each section has transaction date, transaction type, reference, debit, credit, running balance.
  - Summary General Ledger: account name + opening + total debits + total credits + closing balance only.

- **Data model:**
  The report queries `gl_lines` (the core ledger line table populated by all sub-ledger posts):
  ```ts
  export const glLines = mysqlTable('gl_lines', {
    id:              int('id').autoincrement().primaryKey(),
    orgId:           int('org_id').notNull(),
    accountId:       int('account_id').notNull(),
    transactionType: varchar('transaction_type', { length: 50 }).notNull(),
    // 'invoice'|'bill'|'payment'|'journal'|'opening_balance'|'fx_adjustment'|'recurring_journal'
    transactionId:   int('transaction_id').notNull(),
    transactionDate: date('transaction_date').notNull(),
    referenceNumber: varchar('reference_number', { length: 100 }),
    description:     text('description'),
    debitAmount:     decimal('debit_amount', { precision: 15, scale: 2 }).default('0.00'),
    creditAmount:    decimal('credit_amount', { precision: 15, scale: 2 }).default('0.00'),
    currencyId:      int('currency_id'),
    exchangeRate:    decimal('exchange_rate', { precision: 15, scale: 6 }).default('1.000000'),
    contactId:       int('contact_id'),
    projectId:       int('project_id'),
    auditHash:       varchar('audit_hash', { length: 64 }),
    createdAt:       timestamp('created_at').defaultNow(),
  });
  // Indexes: (org_id, account_id, transaction_date), (org_id, transaction_type, transaction_id)
  ```

- **API (contract-first):**
  ```
  GET    /api/reports/general-ledger
         ?date_start, ?date_end, ?account_id (optional; omit = all accounts),
         ?account_type, ?transaction_type, ?contact_id, ?project_id,
         ?view=detailed|summary, ?page, ?per_page
         response: { accounts: [{ account, opening_balance, closing_balance, lines: [...] }], totals }

  GET    /api/reports/general-ledger/export
         same filters + ?format=csv|pdf|xls
         → queues background export job; response: { job_id }

  GET    /api/reports/general-ledger/export/:jobId/status
         response: { status: 'pending'|'ready'|'failed', download_url? }

  GET    /api/reports/trial-balance
         ?as_of_date, ?include_zero_balances
         response: { accounts: [{ account, debit_balance, credit_balance }], totals }
  ```

- **Workflow / state machine:** Read-only report; no state transitions. Opening balance = SUM of all `gl_lines` for the account before `date_start`. Running balance computed in application layer as lines are streamed.

- **Automations:**
  - Background export job: Express worker picks up export jobs from a jobs queue; generates file, writes to local storage (or S3), updates job status.
  - TanStack Query with `staleTime: 30_000` — report auto-refreshes every 30 seconds while open.

- **Personalized / better-than-Zoho:**
  - **Running balance column** computed per line (cumulative) in the API response — Zoho shows this only in PDF export.
  - **Hash-chain integrity indicator:** each GL line shows a checkmark/warning icon based on hash verification against the audit chain — accountants can spot tampered rows instantly.
  - **Drill-through links:** clicking a GL line opens the source transaction (invoice, journal, etc.) in a side panel without losing the report.
  - **Account filter tree:** select one or multiple accounts using the CoA tree picker in the filter panel.
  - **Transaction type badges:** color-coded chips (invoice = blue, journal = purple, fx = orange) for rapid visual scanning.

- **Build status:** New (gl_lines table may exist; report API, running balance, export, hash-chain indicator, drill-through are all New).

---

### 4.9 Bulk Operations

- **Purpose:** Batch updates across journal entries and chart of accounts to reduce repetitive manual actions.

- **Zoho Books behaviour:**
  - Manual Journals: bulk publish (draft → published), bulk delete (draft only), bulk print.
  - Chart of Accounts: bulk activate, bulk deactivate, bulk delete (manually-created, no transactions).
  - Bulk update: identify and modify multiple transactions matching a filter (e.g., change reporting tag across 50 journals).

- **Data model:** No dedicated table; bulk endpoints operate on existing tables transactionally.

- **API (contract-first):**
  ```
  POST   /api/journals/bulk/publish        body: { ids: number[] }   → UPDATE WHERE id IN (...) THEN SELECT affected
  DELETE /api/journals/bulk                body: { ids: number[] }   → rejects published; soft-delete drafts
  POST   /api/journals/bulk/print          body: { ids: number[] }   → returns PDF blob or job_id
  POST   /api/accounts/bulk/activate       body: { ids: number[] }
  POST   /api/accounts/bulk/deactivate     body: { ids: number[] }
  DELETE /api/accounts/bulk                body: { ids: number[] }   → rejects system/transacted accounts; returns { deleted: [], skipped: [{ id, reason }] }
  POST   /api/journals/bulk/update-field   body: { ids: number[], field: 'reporting_tag_id'|'notes', value }  → UPDATE then SELECT count
  ```
  All bulk writes wrapped in a single DB transaction; partial success returns `{ success_count, failed: [{ id, reason }] }`.

- **Workflow / state machine:** Atomic — all succeed or all fail per batch; skipped items reported separately.

- **Automations:** None beyond the individual endpoint automations (audit chain entries per item published).

- **Personalized / better-than-Zoho:**
  - **Partial-success reporting:** Zoho bulk delete silently skips locked or system accounts; Astram returns a structured `{ deleted, skipped: [{ id, reason }] }` response so the UI shows exactly what failed and why.
  - **Confirmation dialog with impact summary:** before bulk publish, UI shows "This will post X journals totaling £Y,ZZZ to the GL — confirm?" (TanStack Query pre-fetch of aggregate).

- **Build status:** New.

---

### 4.10 Accountant Access & Roles

- **Purpose:** Grant external accountants or internal bookkeepers scoped access to GL-related modules without exposing full admin controls or consuming a regular user seat.

- **Zoho Books behaviour:**
  - Three built-in roles: **Admin** (full access), **Staff** (module-level, excludes reports/settings/accountant), **Accountant** (accounting modules only; no seat cost; invited via email; separate portal view).
  - Default Accountant role permissions: Dashboard (view), Chart of Accounts (full), Manual Journals (full), Taxes (view), Banking (view), Sales/Purchases (view).
  - Custom roles can be created with per-module access levels: No Access / View Only / Full Access.
  - Module-level data scoping: restrict by Location, Reporting Tag, or assigned Customers.
  - Users can be marked inactive (access revoked without deletion).
  - Accountants receive an email invitation and log in via their own Zoho account credentials.

- **Data model:**
  ```ts
  export const userRoles = mysqlTable('user_roles', {
    id:          int('id').autoincrement().primaryKey(),
    orgId:       int('org_id').notNull(),
    roleName:    varchar('role_name', { length: 100 }).notNull(),
    roleType:    varchar('role_type', { length: 20 }).default('custom'),
    // 'admin'|'staff'|'accountant'|'custom'
    isSystem:    boolean('is_system').default(false),
    permissions: customJson('permissions').notNull(),
    // { chart_of_accounts: 'full'|'view'|'none', manual_journals: 'full'|'view'|'none', ... }
    createdAt:   timestamp('created_at').defaultNow(),
    updatedAt:   timestamp('updated_at').onUpdateNow(),
  });

  export const orgUsers = mysqlTable('org_users', {
    id:         int('id').autoincrement().primaryKey(),
    orgId:      int('org_id').notNull(),
    userId:     int('user_id').notNull(),
    roleId:     int('role_id').notNull(),
    isAccountant: boolean('is_accountant').default(false), // no seat cost flag
    isActive:   boolean('is_active').default(true),
    inviteStatus: varchar('invite_status', { length: 20 }).default('pending'),
    // 'pending'|'accepted'|'revoked'
    invitedAt:  timestamp('invited_at').defaultNow(),
    acceptedAt: timestamp('accepted_at'),
    createdAt:  timestamp('created_at').defaultNow(),
    updatedAt:  timestamp('updated_at').onUpdateNow(),
  });
  ```

- **API (contract-first):**
  ```
  GET    /api/roles                        list org roles; ?role_type
  POST   /api/roles                        create custom role with permissions JSON
  GET    /api/roles/:id                    single role + effective permissions
  PUT    /api/roles/:id                    update permissions (non-system roles only)
  DELETE /api/roles/:id                    delete (only if no users assigned)
  GET    /api/users                        list org users; ?role_id, ?is_active
  POST   /api/users/invite                 send invite email; body: { email, role_id, is_accountant }; INSERT org_user then SELECT
  PUT    /api/users/:id/role               reassign role → UPDATE then SELECT
  POST   /api/users/:id/deactivate         mark is_active=false
  POST   /api/users/:id/activate           mark is_active=true
  DELETE /api/users/:id                    revoke invite (only pending) or soft-delete
  GET    /api/users/me/permissions         current user's effective permission map (used by frontend to gate UI)
  ```

- **Workflow / state machine:**
  ```
  INVITED(pending) ──accept_invite──► ACTIVE ──deactivate──► INACTIVE
  INVITED(pending) ──revoke──► REVOKED
  INACTIVE ──activate──► ACTIVE
  ```

- **Automations:**
  - Permission map returned from `/api/users/me/permissions` cached in TanStack Query with `staleTime: 5 * 60 * 1000`; all UI feature gates read from this cache.
  - Every sensitive action (GL post, lock set, bulk delete) checks `hasPermission(userId, module, action)` in Express middleware — not just in the frontend.
  - Audit chain: role changes and user invite/deactivate events appended to hash-chain audit log.

- **Personalized / better-than-Zoho:**
  - **Permission map API:** frontend receives a single flat `{ [module_action]: boolean }` map at login — no round-trips per page; all feature gates (hide/show buttons, redirect on unauthorized) driven by this map client-side via a Zustand-powered `usePermissions()` hook.
  - **Accountant-mode view:** when `is_accountant=true`, the nav sidebar reconfigures to show only Accountant-relevant modules — cleaner experience than a full admin view with disabled items.
  - **Invite audit chain:** every invite, acceptance, and deactivation appended to the tamper-evident audit log.

- **Build status:** New.

---

### 4.11 Chart of Accounts Import

- **Purpose:** Bulk-load or migrate a chart of accounts from an existing accounting system via CSV/TSV/XLS without manual entry.

- **Zoho Books behaviour:**
  - Import via Accountant → Chart of Accounts → Import button.
  - Supported formats: CSV, TSV, XLS (max 10 MB).
  - Required fields: `Account Name`, `Account Type`.
  - Optional: `Account Code`, `Description`, `Parent Account`, `Currency`.
  - Duplicate handling: skip (keep existing) or overwrite (update matching account by name/code).
  - Rows with invalid account types rejected with row-level error report.
  - System accounts cannot be overwritten.

- **Data model:** Uses existing `accounts` table; import is a transactional batch insert/update operation.

- **API (contract-first):**
  ```
  POST   /api/accounts/import/validate     multipart file → parse + validate, return { valid_count, errors: [{ row, field, message }] }; NO DB write
  POST   /api/accounts/import              multipart file + body: { on_duplicate: 'skip'|'overwrite' }
                                           → parse, validate, batch INSERT/UPDATE; mutate then SELECT counts
                                           response: { imported: N, updated: N, skipped: N, errors: [{ row, message }] }
  GET    /api/accounts/import/template     download blank CSV template with correct column headers
  ```

- **Workflow / state machine:**
  Two-step: validate first (no writes) → review errors → re-upload or proceed with import.

- **Automations:** None beyond standard post-import account activation and audit chain entry per created/updated account.

- **Personalized / better-than-Zoho:**
  - **Pre-import validation endpoint** (New): client-side the user sees exactly which rows will fail (with row numbers and field names) before committing — Zoho shows errors only after the import runs.
  - **Zod row schema**: each CSV row parsed through a Zod schema client-side (via a shared schema package) giving instant feedback in the browser before upload.
  - **Parent account resolution:** `Parent Account` column accepts either the parent account's name or its code; system resolves either.

- **Build status:** New.

---

## Cross-Cutting Concerns

### Hash-Chain Audit Ledger Integration

Every GL mutation (journal publish, account create/update, lock set, opening balance confirm, FX adjustment post, budget line save) appends an entry to `audit_log`:

```ts
export const auditLog = mysqlTable('audit_log', {
  id:          int('id').autoincrement().primaryKey(),
  orgId:       int('org_id').notNull(),
  entityType:  varchar('entity_type', { length: 50 }).notNull(),
  entityId:    int('entity_id').notNull(),
  action:      varchar('action', { length: 50 }).notNull(),
  actorId:     int('actor_id').notNull(),
  payload:     customJson('payload'),          // full before/after snapshot
  prevHash:    varchar('prev_hash', { length: 64 }).notNull(),
  entryHash:   varchar('entry_hash', { length: 64 }).notNull(),
  // SHA-256(prevHash + entityType + entityId + action + actorId + timestamp)
  createdAt:   timestamp('created_at').defaultNow(),
});
```

The chain guarantees that any deletion or modification of a historical GL record is detectable by re-computing the chain. An `GET /api/audit/verify` endpoint walks the chain and reports the first broken link.

### OpenAPI 3.1 → Orval → TanStack Query Pattern

All endpoints above are defined in `openapi.yaml` first. Orval generates:
- **Zod schemas** for every request body and response shape (including the `.refine()` for debit=credit).
- **TanStack Query hooks** (`useGetJournals`, `usePostJournals`, etc.) consuming the generated Axios client.
- **Mutation hooks** follow `mutate → invalidate → refetch` pattern; no RETURNING needed since all mutations call the corresponding GET after commit.

### Shared Zod Refinements (GL-specific)

```ts
// packages/shared/src/gl.ts
export const JournalLineItemSchema = z.object({
  accountId:     z.number().int().positive(),
  debitOrCredit: z.enum(['debit', 'credit']),
  amount:        z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number),
  description:   z.string().optional(),
  taxId:         z.number().int().positive().optional(),
  contactId:     z.number().int().positive().optional(),
});

export const CreateJournalSchema = z.object({
  journalDate:     z.string().date(),
  referenceNumber: z.string().optional(),
  journalType:     z.enum(['accrual', 'cash', 'both']).default('both'),
  notes:           z.string().optional(),
  currencyId:      z.number().int().positive().optional(),
  exchangeRate:    z.number().positive().default(1),
  lineItems:       z.array(JournalLineItemSchema).min(2),
}).refine(
  data => {
    const debits  = data.lineItems.filter(l => l.debitOrCredit === 'debit').reduce((s, l) => s + l.amount, 0);
    const credits = data.lineItems.filter(l => l.debitOrCredit === 'credit').reduce((s, l) => s + l.amount, 0);
    return Math.abs(debits - credits) < 0.001; // floating-point tolerance
  },
  data => {
    const debits  = data.lineItems.filter(l => l.debitOrCredit === 'debit').reduce((s, l) => s + l.amount, 0);
    const credits = data.lineItems.filter(l => l.debitOrCredit === 'credit').reduce((s, l) => s + l.amount, 0);
    return { message: `Journal does not balance: debits ${debits.toFixed(2)}, credits ${credits.toFixed(2)}, difference ${(debits - credits).toFixed(2)}`, path: ['lineItems'] };
  }
);
```

This schema is used both in the React form (client-side validation via `react-hook-form + zodResolver`) and on the Express route handler — single source of truth.
