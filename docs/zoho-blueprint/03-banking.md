## 3. Banking & Reconciliation

**Overview.** This module is the financial truth layer: every rupee/dollar that moves through the business passes through here. It ingests transactions from live bank feeds (Plaid/Yodlee), manual statement imports, and direct user entry; applies a deterministic rule engine to categorize and match against invoices/bills/expenses/payments; enforces reconciliation periods; and anchors every mutation to the tamper-evident hash-chained audit ledger. The system is designed to be a full Zoho Books replica at parity, then surpass it with ML-assisted categorization, smart anomaly detection, real-time feed webhooks, and a streamlined single-screen reconciliation UX.

**Sub-features in this section:**
1. Bank & Credit-Card Account Management
2. Bank Feeds (Live Auto-Import)
3. Manual Statement Import (CSV/TSV/OFX/QIF/MT940/CAMT)
4. Transaction Categorization
5. Bank Rules (Auto-Categorize / Auto-Match)
6. Transaction Matching (Invoices / Bills / Expenses / Payments)
7. Reconciliation (Statement vs. Book)
8. Fund Transfers Between Accounts
9. Undeposited Funds & Deposit Recording
10. Multi-Currency Accounts
11. Cash & Petty Cash Accounts

---

### 3.1 Bank & Credit-Card Account Management

- **Purpose:** Create and manage all bank, credit-card, cash, PayPal, and other liquid-asset accounts that appear in the banking dashboard.

- **Zoho Books behaviour:**
  - Account types: `bank`, `credit_card`, `cash`, `other_asset`, `other_current_asset` (also PayPal as a special bank).
  - Fields: account name, account code, account number, IBAN/IFSC/routing number, bank name, currency, opening balance + opening balance date, description.
  - Activate / deactivate (soft-delete); primary account flag auto-populates "Deposit To" and "Paid Through" fields elsewhere.
  - Balance views: book balance, bank balance (feed), base-currency equivalent (`bcy_balance`).
  - Sub-accounts supported; accounts receivable / payable types are excluded from banking module.
  - User-level access restrictions (admin assigns specific accounts to specific users — in GA rollout).
  - Overview page: uncategorized transaction count, running balance sparkline, last-feed-sync timestamp.

- **Data model:**
  ```
  bank_accounts
    id                 int autoincrement PK
    org_id             int
    account_name       varchar(255)
    account_code       varchar(50)
    account_number     varchar(100)
    account_type       enum('bank','credit_card','cash','other_asset','other_current_asset','paypal')
    currency_id        int
    currency_code      varchar(10)
    bank_name          varchar(255)
    routing_number     varchar(50)
    iban               varchar(50)
    description        text
    opening_balance    decimal(15,2)  default 0.00
    opening_balance_date date
    current_balance    decimal(15,2)  default 0.00   -- book balance (updated on every txn)
    bank_balance       decimal(15,2)                 -- last known feed balance
    bcy_balance        decimal(15,2)                 -- base-currency equivalent
    is_active          tinyint(1) default 1
    is_primary         tinyint(1) default 0
    is_paypal          tinyint(1) default 0
    feed_provider      enum('plaid','yodlee','manual') nullable
    feed_status        enum('active','inactive','error','mfa_required') nullable
    feed_last_synced_at timestamp nullable
    uncategorized_count int default 0                -- denormalised, updated by job
    created_at         timestamp default current_timestamp
    updated_at         timestamp default current_timestamp on update current_timestamp
    audit_hash         varchar(64)                   -- hash-chain node
  ```

- **API (contract-first):**
  - `GET    /api/bank-accounts` — list; filters: `?type=bank|credit_card|cash`, `?is_active=true`, `?currency_id=`; sort: `account_name|balance|uncategorized_count`; returns paginated list with balance summary.
  - `POST   /api/bank-accounts` — create; body: all fields above; mutate → SELECT by inserted id → return full record.
  - `GET    /api/bank-accounts/:id` — single account with balance, feed status, uncategorized count.
  - `PUT    /api/bank-accounts/:id` — update; mutate → SELECT → return.
  - `DELETE /api/bank-accounts/:id` — soft-delete (set `is_active = 0`) unless transactions exist; hard-delete if zero transactions.
  - `POST   /api/bank-accounts/:id/activate` / `POST   /api/bank-accounts/:id/deactivate`
  - `GET    /api/bank-accounts/:id/balance` — `{ book_balance, bank_balance, bcy_balance, as_of }`.
  - `GET    /api/bank-accounts/overview` — aggregate across all accounts: total assets, total liabilities (credit cards), uncategorized totals.

- **Workflow / state machine:**
  `created (inactive feed)` → `feed connected` → `active` ↔ `inactive`; account with reconciled transactions cannot be deleted, only deactivated.

- **Automations:** Daily job re-computes `uncategorized_count` and `current_balance` from transactions table to self-heal drift. Alert webhook fires when `bank_balance` deviates from `current_balance` by > configurable threshold (default 1% or 500 base-currency units).

- **Personalized / better-than-Zoho:**
  - Balance drift alerting (Zoho has no automated threshold alert).
  - Audit ledger entry on every create/update/delete with hash chaining — Zoho has basic audit log only.
  - Per-account health score (feed uptime, uncategorized rate, reconciliation lag) surfaced on dashboard.
  - Inline balance sparkline chart (7-day rolling) on account cards.

- **Build status:** Partial (basic bank + credit-card CRUD and balance tracking exist; feed status fields, deactivate/activate, sub-accounts, overview endpoint — New).

---

### 3.2 Bank Feeds (Live Auto-Import)

- **Purpose:** Continuously pull bank transactions from financial institutions via Plaid/Yodlee so users never have to manually enter feed data.

- **Zoho Books behaviour:**
  - Providers: Plaid (US/CA — authenticates via bank's own OAuth flow), Yodlee (global), Syncfy (Mexico), Token (EU).
  - Auto-fetch every 24 hours for non-MFA banks; MFA banks require manual refresh.
  - Fetch lag: previous business day's transactions.
  - Historical backfill: up to 1 year via Plaid (was 90 days); Yodlee varies by institution.
  - Credential update flow when bank password changes.
  - Feed status indicators per account; deactivate/reactivate per account.
  - Fetched transactions land as `uncategorized`; existing rules fire immediately on arrival.
  - Duplicate detection: built-in duplicate suppression on re-fetch.

- **Data model:**
  ```
  bank_feed_connections
    id               int autoincrement PK
    bank_account_id  int
    provider         enum('plaid','yodlee','syncfy','token')
    provider_item_id varchar(255)        -- Plaid item_id / Yodlee providerAccountId
    provider_access_token text           -- encrypted at rest
    institution_id   varchar(255)
    institution_name varchar(255)
    status           enum('active','inactive','error','mfa_required','pending_expiry')
    last_sync_at     timestamp nullable
    last_error       text nullable
    consent_expires_at timestamp nullable
    historical_fetched_from date nullable
    created_at       timestamp default current_timestamp
    updated_at       timestamp default current_timestamp on update current_timestamp

  bank_feed_sync_log
    id               int autoincrement PK
    connection_id    int
    started_at       timestamp
    finished_at      timestamp nullable
    txns_fetched     int default 0
    txns_new         int default 0
    txns_duplicate   int default 0
    status           enum('running','success','partial','failed')
    error_detail     text nullable
  ```
  (Imported transactions land in `bank_transactions` with `source = 'feed'`.)

- **API (contract-first):**
  - `POST   /api/bank-accounts/:id/feed/connect` — initiate Plaid Link / Yodlee FastLink; returns `{ link_token }` or redirect URL.
  - `POST   /api/bank-accounts/:id/feed/exchange` — exchange public_token → access_token; store encrypted; kick off initial backfill job; mutate → SELECT → return connection record.
  - `GET    /api/bank-accounts/:id/feed/status` — `{ status, last_sync_at, last_error, txns_pending }`.
  - `POST   /api/bank-accounts/:id/feed/refresh` — manual trigger (rate-limited: once per 15 min); enqueues sync job; returns `{ job_id }`.
  - `DELETE /api/bank-accounts/:id/feed` — disconnect (revoke token at provider, set status inactive).
  - `GET    /api/bank-accounts/:id/feed/sync-log` — paginated sync history with per-run stats.

- **Workflow / state machine:**
  `disconnected` → `[connect]` → `pending` → `active` → auto-sync every 24 h → `error` (retry 3×) → `mfa_required` (user re-authenticates) → `active`; `consent_expires_at` → 30-day pre-expiry webhook nudge → user re-authorizes.

- **Automations:**
  - Node cron / BullMQ job runs at 02:00 local org timezone; fetches all `active` connections; deduplicates by `(bank_account_id, date, amount, description)` fingerprint hash before insert.
  - On insert of new feed transactions: rule engine fires synchronously (see §3.5).
  - On `status = error` for > 3 consecutive runs: org admin notification email + in-app banner.
  - Plaid webhook (`TRANSACTIONS_SYNC`) triggers immediate ingest rather than waiting for cron — near real-time for supported institutions.

- **Personalized / better-than-Zoho:**
  - Plaid webhook integration for near-real-time feeds (Zoho polls daily only).
  - Fingerprint-based duplicate detection with ML similarity fallback for near-duplicate descriptions.
  - Consent expiry proactive alerts (Zoho shows error only after expiry).
  - Sync health dashboard with per-institution reliability score.
  - Auto-pause feed + alert if institution returns > 20% duplicate rate (indicator of Plaid issue).

- **Build status:** New.

---

### 3.3 Manual Statement Import (CSV / TSV / OFX / QIF / MT940 / CAMT)

- **Purpose:** Accept bank statements in standard file formats when live feeds are unavailable or for historical data loading.

- **Zoho Books behaviour:**
  - Supported formats: CSV, TSV, XLS, OFX, QIF, CAMT.053, CAMT.054, MT940, PDF (US/CA/MX via AI extraction).
  - CSV/TSV column modes: Double Column (separate debit/credit), Single Column + Amount Type, Single Column + Negative Values.
  - Field mapping UI: user maps imported columns to system fields (date, description, debit, credit, reference, balance).
  - Character encoding and delimiter selectable.
  - Post-import: all transactions land as `uncategorized`; rules fire immediately.
  - Undo last import: reverses all transactions from that import batch.
  - Duplicate detection across re-imports of same file or overlapping date ranges.
  - Last-imported statement viewable; import history with delete per batch.

- **Data model:**
  ```
  bank_statement_imports
    id               int autoincrement PK
    bank_account_id  int
    filename         varchar(500)
    file_format      enum('csv','tsv','xls','ofx','qif','mt940','camt053','camt054','pdf')
    status           enum('pending','processing','completed','failed','undone')
    txns_total       int default 0
    txns_imported    int default 0
    txns_duplicate   int default 0
    date_range_from  date nullable
    date_range_to    date nullable
    column_mapping   json           -- { date: 'col_A', description: 'col_B', ... }
    amount_mode      enum('double','single_type','single_negative') nullable
    uploaded_by      int            -- user_id
    created_at       timestamp default current_timestamp
    updated_at       timestamp default current_timestamp on update current_timestamp
    audit_hash       varchar(64)
  ```
  (Imported transactions in `bank_transactions` carry `import_batch_id` FK-equivalent int for undo.)

- **API (contract-first):**
  - `POST   /api/bank-accounts/:id/statements/upload` — multipart; returns `{ import_id, detected_format, preview_rows[], column_headers[] }`.
  - `POST   /api/bank-accounts/:id/statements/:importId/map` — submit column mapping + amount_mode; returns `{ preview_mapped[], duplicate_count, net_new_count }`.
  - `POST   /api/bank-accounts/:id/statements/:importId/confirm` — execute import; mutate rows into `bank_transactions`; update `bank_statement_imports.status = completed`; return `{ txns_imported, txns_skipped }`.
  - `GET    /api/bank-accounts/:id/statements` — list imports with status, date range, counts.
  - `GET    /api/bank-accounts/:id/statements/last` — most recent import summary.
  - `DELETE /api/bank-accounts/:id/statements/:importId` — undo batch (set all child transactions `is_deleted = 1`, status → `undone`).

- **Workflow / state machine:**
  `upload` → `preview/map` → `confirm` → `completed` | `failed`; `completed` → `[undo]` → `undone` (cascades transaction deletes, re-opens any matches made against those transactions).

- **Automations:**
  - Parser service (server-side): OFX/QIF parsed via ofx-js / similar; MT940 via mt940 npm package; CAMT via xml2js with CAMT schema; CSV via papaparse with encoding detection.
  - Duplicate detection: SHA-256 of `(bank_account_id, date, amount, description_normalized)` checked before insert.
  - After confirm: rule engine fires on all newly inserted `uncategorized` transactions (same as feed path).

- **Personalized / better-than-Zoho:**
  - AI-assisted column mapping: model suggests mapping based on header names + first 5 rows — no user config needed for common bank exports.
  - PDF parsing with LLM extraction (Zoho limits this to US/CA/MX; we extend to any well-structured tabular PDF).
  - Overlap detection with existing feed transactions across date range to prevent double-counting.
  - Visual diff preview before confirm: shows which rows are new vs. duplicate.
  - Batch undo cascades to matched/reconciled state restoration (Zoho undo is limited).

- **Build status:** New.

---

### 3.4 Transaction Categorization

- **Purpose:** Assign every imported or feed transaction to an account/category/transaction-type so it flows into the general ledger correctly.

- **Zoho Books behaviour:**
  - Statuses: `uncategorized` → `recognized` (rule match flagged for review) → `categorized` or `matched`.
  - Manual categorization: user picks transaction type (expense, vendor payment, customer payment, sales without invoice, interest income, owner contribution, owner drawings, transfer, etc.) and account, payee, tax, reference.
  - Auto-categorization via rules: `auto_categorize` mode skips review; `recognize` mode tags and waits.
  - Quick Categorize: spreadsheet-like bulk editor; up to 50 transactions at once; filterable by deposit/withdrawal/date.
  - Uncategorize: reverts a categorized transaction back to uncategorized and deletes the linked ledger entry.
  - AI Field Prediction: auto-suggests category, account, vendor based on past behavior (2026 feature).

- **Data model:**
  ```
  bank_transactions
    id                   int autoincrement PK
    bank_account_id      int
    import_batch_id      int nullable           -- null = feed or manual entry
    transaction_date     date
    description          varchar(1000)
    description_normalized varchar(1000)        -- lowercased, punctuation stripped, for matching
    amount               decimal(15,2)          -- always positive
    direction            enum('credit','debit') -- credit = money in, debit = money out
    running_balance      decimal(15,2) nullable
    source               enum('feed','import','manual')
    status               enum('uncategorized','recognized','categorized','matched','excluded','reconciled')
    transaction_type     enum('expense','vendor_payment','customer_payment','transfer_fund',
                              'card_payment','sales_without_invoice','expense_refund',
                              'interest_income','other_income','owner_contribution',
                              'owner_drawings','sales_return','credit_note_refund',
                              'vendor_credit_refund') nullable
    account_id           int nullable           -- chart-of-accounts account
    payee_id             int nullable           -- customer or vendor id
    payee_type           enum('customer','vendor') nullable
    tax_id               int nullable
    tax_amount           decimal(15,2) nullable
    reference_number     varchar(255) nullable
    payment_mode         varchar(50) nullable
    applied_rule_id      int nullable
    matched_entity_type  enum('invoice','bill','expense','payment','transfer') nullable
    matched_entity_id    int nullable
    reconciliation_id    int nullable
    currency_id          int
    currency_code        varchar(10)
    exchange_rate        decimal(15,6) default 1.000000
    amount_bcy           decimal(15,2)          -- base currency
    tags                 json nullable           -- [{ tag_id, tag_option_id }]
    notes                text nullable
    attachments          json nullable           -- [{ filename, url }]
    is_deleted           tinyint(1) default 0
    fingerprint          varchar(64) unique      -- SHA-256 dedupe key
    created_at           timestamp default current_timestamp
    updated_at           timestamp default current_timestamp on update current_timestamp
    audit_hash           varchar(64)
  ```

- **API (contract-first):**
  - `GET    /api/bank-accounts/:id/transactions` — list with filters: `?status=uncategorized|recognized|categorized|matched|reconciled`, `?direction=credit|debit`, `?from=&to=`, `?search=`, `?rule_id=`; paginated; returns running balance per row.
  - `POST   /api/bank-transactions/:id/categorize` — body: `{ transaction_type, account_id, payee_id, tax_id, reference_number, payment_mode, tags, notes }`; mutate → SELECT → return updated transaction + new audit entry.
  - `POST   /api/bank-transactions/:id/uncategorize` — revert to uncategorized; deletes linked ledger journal if auto-created; mutate → SELECT.
  - `POST   /api/bank-transactions/bulk-categorize` — body: `{ transaction_ids[], ...shared_fields }`; applies same categorization to all; returns `{ success_count, error_count }`.
  - `POST   /api/bank-transactions/:id/exclude` — mark excluded (ignore in reconciliation).
  - `POST   /api/bank-transactions/:id/restore` — restore excluded → uncategorized.

- **Workflow / state machine:**
  `uncategorized` → `[rule fires]` → `recognized` → `[user confirms or auto]` → `categorized`
  `uncategorized` → `[user manual]` → `categorized`
  `categorized` → `[reconcile]` → `reconciled`
  `categorized` → `[uncategorize]` → `uncategorized`

- **Automations:** Rule engine fires on every new transaction insert (feed ingest or import confirm). AI suggestion endpoint called lazily on first user open of transaction panel (non-blocking).

- **Personalized / better-than-Zoho:**
  - ML categorization model: trained per-org on historical `(description_normalized → transaction_type, account_id, payee_id)` triples; confidence score shown; user can override, and override feeds back to training.
  - Quick Categorize supports > 50 transactions (Zoho caps at 50) via virtual scroll.
  - Anomaly detection flags transactions that break the org's normal pattern (unusual payee, amount spike, after-hours).
  - Audit ledger records every categorize/uncategorize event with before/after snapshot and hash chain.

- **Build status:** Partial (credit/debit transactions, running balance exist; status machine, bulk categorize, rule engine integration, ML suggestions — New).

---

### 3.5 Bank Rules (Auto-Categorize / Auto-Match)

- **Purpose:** Deterministic rule engine that inspects incoming transactions and automatically categorizes or flags them, eliminating repetitive manual work.

- **Zoho Books behaviour:**
  - Rule scope: `deposit` (money-in) or `withdrawal` (money-out).
  - Criteria logic: `ALL` (AND) or `ANY` (OR) of conditions.
  - Condition fields: Payee, Description, Reference Number, Amount.
  - Condition operators (text): `is`, `contains`, `starts_with`, `is_empty`.
  - Condition operators (amount): `=`, `>`, `>=`, `<`, `<=`.
  - Actions: set `transaction_type`, `account_id`, `customer_id`/`vendor_id`, `tax_id`, `payment_mode`, `reference_number`.
  - Apply mode: `autocategorize` (silent) or `recognize` (tag for review).
  - Centralized rules: one rule applied across multiple bank accounts/cards.
  - Rule ordering: explicit priority order (POST `/bankaccounts/rules/order`).
  - Suggested rules: system proposes rules based on repeated manual categorizations; user can skip.
  - Match filters: separate filter layer for auto-matching (links to existing invoices/bills).

- **Data model:**
  ```
  bank_rules
    id               int autoincrement PK
    org_id           int
    rule_name        varchar(255)
    apply_to         enum('deposit','withdrawal')
    criteria_type    enum('all','any')           -- AND vs OR
    apply_mode       enum('autocategorize','recognize')
    transaction_type enum(... same as bank_transactions.transaction_type ...)  nullable
    account_id       int nullable
    payee_id         int nullable
    payee_type       enum('customer','vendor') nullable
    tax_id           int nullable
    payment_mode     varchar(50) nullable
    reference_mode   enum('auto','manual') default 'auto'
    reference_value  varchar(255) nullable
    priority         int default 0              -- lower = higher priority; unique per org
    is_active        tinyint(1) default 1
    account_ids      json                        -- [] = all accounts; else specific account ids
    created_at       timestamp default current_timestamp
    updated_at       timestamp default current_timestamp on update current_timestamp
    audit_hash       varchar(64)

  bank_rule_criteria
    id               int autoincrement PK
    rule_id          int
    field            enum('description','payee','reference_number','amount')
    operator         enum('is','contains','starts_with','is_empty','eq','gt','gte','lt','lte')
    value            varchar(500) nullable       -- null for 'is_empty'
    created_at       timestamp default current_timestamp
  ```

- **API (contract-first):**
  - `GET    /api/bank-rules` — list all rules; filters: `?apply_to=deposit|withdrawal`, `?is_active=`; ordered by `priority`.
  - `POST   /api/bank-rules` — create rule + criteria in one transaction; mutate → SELECT rule with criteria → return.
  - `GET    /api/bank-rules/:id` — single rule with all criteria.
  - `PUT    /api/bank-rules/:id` — update rule + replace criteria set; mutate → SELECT.
  - `DELETE /api/bank-rules/:id` — soft-delete (set `is_active = 0`) if applied to any historical transactions; hard-delete otherwise.
  - `PUT    /api/bank-rules/order` — body: `{ ordered_ids: [id, id, ...] }`; bulk-update `priority` field; mutate → return updated list.
  - `POST   /api/bank-rules/suggest` — body: `{ bank_account_id }`; returns AI-suggested rules from repetition analysis.
  - `POST   /api/bank-rules/suggest/:id/skip` — dismiss a suggestion.
  - `POST   /api/bank-rules/:id/test` — body: `{ description, amount, direction }`; returns `{ matches: bool, applied_fields }` — dry-run without side effects.

- **Workflow / state machine:**
  Rule created → sorted by `priority` → on every new `uncategorized` transaction: iterate rules in priority order → first matching rule wins → if `autocategorize`: set status `categorized` + write journal; if `recognize`: set status `recognized` + pre-fill fields. No match: remains `uncategorized`.

- **Automations:**
  - Rule engine runs in-process on feed ingest (synchronous, fast path) and post-import confirm (async batch).
  - Suggestion job runs weekly: scans `bank_transactions` where `applied_rule_id IS NULL` and `status = categorized`; groups by `description_normalized` + categorization; surfaces patterns with ≥ 3 occurrences as suggested rules.
  - Rule conflict detection: warn if two active rules with overlapping criteria exist at same priority level.

- **Personalized / better-than-Zoho:**
  - Regex operator added (not in Zoho) — allows `description REGEXP '^AMZN'`.
  - Rule test/dry-run endpoint (Zoho has no test mode).
  - ML-generated rule suggestions with confidence score from categorization history (Zoho suggestions are simpler frequency-based).
  - Rule analytics: `times_applied_total`, `last_applied_at` shown per rule so users know which rules are active vs. dead weight.
  - Cross-account rule management with per-account override capability.
  - Audit ledger: every rule create/update/delete + every rule application logged with hash chain.

- **Build status:** New.

---

### 3.6 Transaction Matching (Invoices / Bills / Expenses / Payments)

- **Purpose:** Link an imported bank transaction to an existing invoice payment, bill payment, expense, or other record so the books stay consistent without double-counting.

- **Zoho Books behaviour:**
  - Triggers: transactions tagged `recognized` or `uncategorized` can be matched; "Match found" auto-tag for high-confidence candidates.
  - Match types: Best Match (same date + amount), Possible Match (within 90 days, any amount).
  - Matchable entities: invoices (customer payments), bills (vendor payments), expenses, credit note refunds, vendor credit refunds, other bank transactions (transfer matching).
  - Multi-match: batch-select multiple uncategorized transactions → consolidated match panel.
  - Cross-direction: a deposit can match against a withdrawal (and vice versa) for contra entries.
  - Adjustment: if amounts differ (e.g., bank fee deducted by payer), user can add a `+ Create Adjustment` line item to reconcile the difference.
  - Unmatch: reverts matched transaction to `uncategorized`; the matched entity returns to its prior state.
  - Uncategorize (from matched): removes the match AND deletes the auto-created categorization.
  - Pagination: when many possible matches exist, user paginates through candidates.

- **Data model:**
  ```
  bank_transaction_matches
    id                   int autoincrement PK
    bank_transaction_id  int
    matched_entity_type  enum('invoice','bill','expense','customer_payment',
                              'vendor_payment','credit_note_refund',
                              'vendor_credit_refund','bank_transaction')
    matched_entity_id    int
    matched_at           timestamp default current_timestamp
    match_confidence     decimal(5,4) nullable   -- 0.0000–1.0000
    match_method         enum('auto_rule','auto_ml','manual','best_match','possible_match')
    adjustment_amount    decimal(15,2) default 0.00
    adjustment_account_id int nullable
    adjustment_description varchar(500) nullable
    created_by           int                     -- user_id; 0 = system
    is_active            tinyint(1) default 1    -- 0 = unmatched
    audit_hash           varchar(64)
  ```

- **API (contract-first):**
  - `GET    /api/bank-transactions/:id/match-candidates` — returns `{ best_matches[], possible_matches[] }`; query params: `?entity_type=invoice|bill|expense|payment`, `?date_tolerance_days=90`, `?amount_tolerance_pct=5`.
  - `POST   /api/bank-transactions/:id/match` — body: `{ matched_entity_type, matched_entity_id, adjustment? }`; creates match record, updates `bank_transactions.status = matched`, updates matched entity status; mutate → SELECT → return.
  - `POST   /api/bank-transactions/:id/unmatch` — deactivates match record, reverts statuses; mutate → SELECT.
  - `POST   /api/bank-transactions/bulk-match` — body: `{ matches: [{ transaction_id, entity_type, entity_id }] }`; batch match for Quick Categorize; returns `{ success[], errors[] }`.
  - `GET    /api/bank-transactions/unmatched-summary` — aggregate count of unmatched transactions by type, for dashboard widget.

- **Workflow / state machine:**
  `uncategorized|recognized` → `[match confirmed]` → `matched` → `[reconcile]` → `reconciled`
  `matched` → `[unmatch]` → `uncategorized`
  `matched` → `[uncategorize]` → `uncategorized` (+ deletes matched entity or resets its status)

- **Automations:**
  - On feed ingest: after rule engine pass, auto-matching job runs: queries open invoices/bills/expenses where `amount_due = transaction.amount` AND `date BETWEEN txn.date - 90d AND txn.date`; scores candidates; if top score ≥ 0.92 → auto-match with `match_method = auto_ml`; else → tag `recognized` with candidates pre-loaded.
  - Nightly job: surfaces aging unmatched transactions (> 7 days uncategorized) in notification center.

- **Personalized / better-than-Zoho:**
  - ML scoring model considers payee name similarity, amount, date proximity, historical match patterns — not just date+amount (Zoho uses date+amount heuristic only).
  - Fuzzy amount matching with configurable tolerance (e.g., ± 2% for payment gateway fees) — Zoho requires exact match or manual adjustment.
  - Match confidence score shown to user so they can assess quality before confirming.
  - Bulk match with ML pre-selection — Zoho bulk requires fully manual selection.
  - Audit ledger: match and unmatch events with entity snapshots, hash-chained.

- **Build status:** New.

---

### 3.7 Reconciliation (Statement vs. Book)

- **Purpose:** Periodically confirm that the book balance matches the bank's closing statement balance, locking the period so transactions cannot be silently altered retroactively.

- **Zoho Books behaviour:**
  - Initiate: select account → Gear → Reconcile Account → Initiate Reconciliation → enter start date, end date, closing balance.
  - Only matched, categorized, and manually-added transactions shown in the reconciliation view.
  - User checks off transactions; running "Cleared Amount" updates; must equal closing balance (difference = 0) to finalize.
  - Save as Draft: defer to later; resumes from same state.
  - Add Adjustment: insert a new transaction inline during reconciliation for rounding/fee differences.
  - Finalize: click Reconcile → period locked.
  - Undo reconciliation: most-recent period only; must cascade-undo all subsequent periods if going back further.
  - Opening balance locked after first reconciliation.
  - Reconciliation Status Report: export CSV/PDF; shows matched vs. unmatched per period.
  - Corporate card support: filters for transactions pending expense approval.

- **Data model:**
  ```
  bank_reconciliations
    id                   int autoincrement PK
    bank_account_id      int
    period_start         date
    period_end           date
    statement_closing_balance decimal(15,2)
    opening_balance      decimal(15,2)           -- book balance at period_start
    cleared_amount       decimal(15,2)           -- sum of checked transactions
    difference           decimal(15,2)           -- statement_closing_balance - cleared_amount; must be 0 to finalize
    status               enum('draft','reconciled','undone')
    reconciled_at        timestamp nullable
    reconciled_by        int nullable             -- user_id
    undone_at            timestamp nullable
    undone_by            int nullable
    created_at           timestamp default current_timestamp
    updated_at           timestamp default current_timestamp on update current_timestamp
    audit_hash           varchar(64)

  bank_reconciliation_items
    id                   int autoincrement PK
    reconciliation_id    int
    bank_transaction_id  int
    is_cleared           tinyint(1) default 0
    cleared_at           timestamp nullable
    created_at           timestamp default current_timestamp
  ```

- **API (contract-first):**
  - `GET    /api/bank-accounts/:id/reconciliations` — list periods with status, dates, difference.
  - `POST   /api/bank-accounts/:id/reconciliations` — initiate new reconciliation; body: `{ period_start, period_end, statement_closing_balance }`; populates `bank_reconciliation_items` from eligible transactions; mutate → SELECT → return `{ reconciliation_id, opening_balance, eligible_transactions[], cleared_amount, difference }`.
  - `GET    /api/bank-accounts/:id/reconciliations/:rid` — full period with all items and cleared status.
  - `PUT    /api/bank-accounts/:id/reconciliations/:rid/items` — bulk update cleared status; body: `{ items: [{ transaction_id, is_cleared }] }`; mutate → return updated `cleared_amount`, `difference`.
  - `PUT    /api/bank-accounts/:id/reconciliations/:rid/draft` — save progress without finalizing.
  - `POST   /api/bank-accounts/:id/reconciliations/:rid/finalize` — validate `difference = 0`; set `status = reconciled`; update all cleared `bank_transactions.status = reconciled`; update `bank_transactions.reconciliation_id`; mutate → SELECT → return; append audit ledger entry with hash.
  - `DELETE /api/bank-accounts/:id/reconciliations/:rid` — undo; must be most-recent period OR cascade undo of all subsequent; reverts `bank_transactions.status` from `reconciled` back to prior state; mutate → return.
  - `GET    /api/bank-accounts/:id/reconciliations/report` — reconciliation status report; filters: `?from=&to=`; exportable as CSV (response header: `Content-Type: text/csv`).

- **Workflow / state machine:**
  `draft` (initiated, items loaded) → `[user checks items]` → `draft` (difference updating) → `[difference = 0]` → `[finalize]` → `reconciled`
  `reconciled` → `[undo, if most recent]` → `undone` (transactions revert to `categorized|matched`)
  Subsequent reconciled periods block undo of earlier periods — must cascade from newest.

- **Automations:**
  - Monthly nudge: on 1st of month, notify org admins of any bank accounts with `last_reconciled_at > 45 days ago`.
  - Auto-populate reconciliation items: query `bank_transactions WHERE bank_account_id = ? AND status IN ('categorized','matched') AND transaction_date BETWEEN period_start AND period_end AND reconciliation_id IS NULL`.
  - On finalize: hash-chain audit ledger entry captures `{ reconciliation_id, period, closing_balance, cleared_count, reconciled_by, timestamp }` — tamper-evident seal on the period.
  - Discrepancy alert: if `difference != 0` after 3 saves, surface inline help suggesting unrecorded bank charges or timing differences.

- **Personalized / better-than-Zoho:**
  - Real-time difference calculator updates as user checks/unchecks — no page reload (Zoho reloads).
  - Smart suggestion: auto-checks transactions that sum exactly to the remaining difference (subset-sum hint), surfaced as "Suggested to clear."
  - Reconciliation lock: once `reconciled`, any attempt to edit a transaction in that period requires an unlock + re-reconcile (Zoho allows silent edits which corrupt history).
  - Tamper-evident audit ledger: reconciliation finalize written to hash-chain — provable that the record has not been altered post-close.
  - Period gap detection: warns if new reconciliation's `period_start` does not follow immediately from last `period_end`.
  - Export to PDF with digital signature metadata for audit trail sharing.

- **Build status:** New.

---

### 3.8 Fund Transfers Between Accounts

- **Purpose:** Record movement of money between two internal accounts (e.g., operating checking to savings, credit-card payment from checking) as a balanced transfer — debit one account, credit another, no P&L impact.

- **Zoho Books behaviour:**
  - Transaction type: `transfer_fund`.
  - Fields: from_account, to_account, amount, date, reference, payment_mode, description.
  - Multi-currency: if accounts are in different currencies, exchange rate is required; creates two entries — one in each currency.
  - The bank feed may import both sides of the transfer (one as debit, one as credit) as separate uncategorized transactions; user matches both to the same transfer.
  - Categorization path: uncategorized deposit → categorize as "Transfer from Another Account" → picks source.
  - Credit-card payment: special case of transfer — from bank to credit-card account.

- **Data model:**
  ```
  bank_transfers
    id               int autoincrement PK
    from_account_id  int
    to_account_id    int
    amount           decimal(15,2)               -- amount in from_account currency
    to_amount        decimal(15,2)               -- amount in to_account currency (if different currency)
    exchange_rate    decimal(15,6) default 1.000000
    transfer_date    date
    reference_number varchar(255) nullable
    payment_mode     varchar(50) nullable
    description      text nullable
    from_txn_id      int nullable                -- bank_transaction id on from side (feed-matched)
    to_txn_id        int nullable                -- bank_transaction id on to side (feed-matched)
    status           enum('draft','completed','reconciled')
    created_at       timestamp default current_timestamp
    updated_at       timestamp default current_timestamp on update current_timestamp
    audit_hash       varchar(64)
  ```

- **API (contract-first):**
  - `GET    /api/bank-transfers` — list; filters: `?from_account_id=`, `?to_account_id=`, `?from=&to=`, `?status=`.
  - `POST   /api/bank-transfers` — create; body: `{ from_account_id, to_account_id, amount, to_amount?, exchange_rate?, transfer_date, reference_number?, payment_mode?, description? }`; creates debit on from_account, credit on to_account in `bank_transactions`; updates both account balances; mutate → SELECT → return.
  - `GET    /api/bank-transfers/:id` — single transfer with both transaction legs.
  - `PUT    /api/bank-transfers/:id` — update (allowed only if not reconciled); mutate → SELECT.
  - `DELETE /api/bank-transfers/:id` — delete if not reconciled; reverses both transaction legs; mutate → return.

- **Workflow / state machine:**
  `draft` → `completed` (on create/confirm) → `reconciled` (when either leg reconciled) — once `reconciled`, update/delete blocked.

- **Automations:**
  - On feed ingest, if two uncategorized transactions exist in different accounts with equal amounts (or exchange-rate-equivalent amounts) on same date ± 2 days, auto-suggest as a transfer pair in the matching UI.
  - Transfer suggestion confidence score based on amount match, date proximity, and account-pair history.

- **Personalized / better-than-Zoho:**
  - Feed-side auto-pairing: when both legs arrive via feed, system auto-links them and shows a single "confirm transfer" action instead of requiring manual categorization of each leg (Zoho: user must categorize each side separately).
  - Exchange rate auto-fill from stored daily FX rates for the transfer date.
  - Transfer analytics: cash flow between accounts charted per month for treasury visibility.

- **Build status:** New.

---

### 3.9 Undeposited Funds & Deposit Recording

- **Purpose:** Hold customer payments received but not yet deposited to a bank account (e.g., checks in hand), then batch them into a single bank deposit matching the actual bank credit.

- **Zoho Books behaviour:**
  - `Undeposited Funds` is a system current-asset account; customer payments default to it when "Deposit To" is not a specific bank account.
  - Three ways to deposit: (1) edit payment → change Deposit To account; (2) bulk-update payments; (3) Banking module → Add Transaction → Deposit From Other Accounts → From: Undeposited Funds.
  - Record Deposit modal: select specific payments from undeposited funds; system sums total; multi-currency filtered by account currency; creates a single bank credit matching the bank's deposit line.
  - References to all included payments maintained on the deposit record.
  - PayPal: special handling — PayPal balance is itself an "undeposited" holding that can be transferred to bank.

- **Data model:**
  ```
  bank_deposits
    id                   int autoincrement PK
    bank_account_id      int                      -- destination account
    deposit_date         date
    total_amount         decimal(15,2)
    currency_id          int
    currency_code        varchar(10)
    reference_number     varchar(255) nullable
    description          text nullable
    bank_transaction_id  int nullable             -- linked feed/import transaction
    status               enum('draft','deposited','reconciled')
    created_at           timestamp default current_timestamp
    updated_at           timestamp default current_timestamp on update current_timestamp
    audit_hash           varchar(64)

  bank_deposit_items
    id                   int autoincrement PK
    deposit_id           int
    payment_id           int                      -- customer_payment.id
    payment_amount       decimal(15,2)
    created_at           timestamp default current_timestamp
  ```

- **API (contract-first):**
  - `GET    /api/undeposited-funds` — list customer payments in undeposited funds; filters: `?currency_id=`, `?customer_id=`, `?from=&to=`; returns `{ payments[], total }`.
  - `POST   /api/bank-deposits` — create deposit; body: `{ bank_account_id, deposit_date, payment_ids[], reference_number?, description? }`; moves selected payments from Undeposited Funds to bank account; creates credit `bank_transaction`; mutate → SELECT → return deposit with items.
  - `GET    /api/bank-deposits` — list deposits; filters: `?bank_account_id=`, `?status=`, `?from=&to=`.
  - `GET    /api/bank-deposits/:id` — single deposit with all included payments.
  - `DELETE /api/bank-deposits/:id` — undo deposit (if not reconciled); returns payments to Undeposited Funds.

- **Workflow / state machine:**
  payment received → `Undeposited Funds` (holding) → `[deposit recorded]` → payment moves to bank account → `deposited` → `[reconcile]` → `reconciled`.

- **Automations:**
  - Nightly: if undeposited funds balance > configurable threshold for > N days, notify org admin.
  - On deposit record: auto-suggest matching the new bank credit to the corresponding feed transaction (same amount, same date ± 1 day).

- **Personalized / better-than-Zoho:**
  - Auto-match deposit record to incoming feed transaction (Zoho requires manual match).
  - Aging report: payments sitting in undeposited funds > 3/7/14 days highlighted with escalating urgency.
  - Grouped deposit builder: drag-and-drop payments into deposit batches that can be saved as draft before committing.

- **Build status:** New.

---

### 3.10 Multi-Currency Accounts

- **Purpose:** Support bank and credit-card accounts denominated in foreign currencies, with automatic exchange-rate conversion for reporting and cross-currency transfers.

- **Zoho Books behaviour:**
  - Each bank account has a single `currency_id`; base currency is set at org level.
  - Transactions recorded in account currency; `amount_bcy` stored as `amount × exchange_rate`.
  - Exchange rates: manual entry or auto-fetched from Zoho's rate service.
  - `bcy_balance` shown alongside account-currency balance on overview.
  - Multi-currency transfers: enter exchange rate between two different-currency accounts; system records debit in source currency and credit in target currency.
  - Customer payments in foreign currency → Undeposited Funds → deposit to matching foreign-currency bank account, with explicit exchange rate at deposit.
  - Forex gain/loss: realized on settlement (invoice payment vs. bank amount); posted to Forex Gain/Loss account.
  - Limitation: transaction rules cannot span accounts with different foreign currencies.

- **Data model additions (to `bank_transactions`):**
  Already included above: `currency_id`, `currency_code`, `exchange_rate decimal(15,6)`, `amount_bcy decimal(15,2)`.

  ```
  exchange_rates
    id               int autoincrement PK
    org_id           int
    from_currency    varchar(10)
    to_currency      varchar(10)
    rate             decimal(15,6)
    rate_date        date
    source           enum('manual','auto','openexchangerates','ecb')
    created_at       timestamp default current_timestamp
    -- unique key: (org_id, from_currency, to_currency, rate_date)

  forex_gain_loss_entries
    id               int autoincrement PK
    org_id           int
    bank_transaction_id int nullable
    invoice_id       int nullable
    bill_id          int nullable
    amount_gain_loss decimal(15,2)              -- positive = gain, negative = loss
    currency_id      int
    exchange_rate_at_invoice decimal(15,6)
    exchange_rate_at_payment decimal(15,6)
    recorded_at      timestamp
    audit_hash       varchar(64)
  ```

- **API (contract-first):**
  - `GET    /api/exchange-rates` — list stored rates; filters: `?from_currency=`, `?to_currency=`, `?date=`.
  - `POST   /api/exchange-rates` — manual rate entry; mutate → SELECT.
  - `GET    /api/exchange-rates/live` — fetch live rate from provider for given currency pair + date.
  - `GET    /api/bank-accounts/:id/forex-summary` — `{ realized_gain, realized_loss, unrealized_gain_loss, period }`.

- **Workflow:** Foreign currency transaction enters → `exchange_rate` stored at transaction time → on matching to invoice/bill, compare invoice exchange rate vs. payment exchange rate → if different, create `forex_gain_loss_entry`.

- **Automations:**
  - Daily job fetches exchange rates for all org-used currency pairs from Open Exchange Rates / ECB and stores in `exchange_rates` with `source = auto`.
  - Month-end: unrealized FX revaluation job computes mark-to-market balance differences for open foreign-currency positions; posts journal entry; posts to audit ledger.

- **Personalized / better-than-Zoho:**
  - FX rate auto-fetch at transaction time (Zoho requires manual rate entry or navigating away).
  - Unrealized FX gain/loss tracking with month-end revaluation (Zoho tracks only realized).
  - FX exposure dashboard: shows net open exposure per currency across all accounts, invoices, and bills.
  - Historical rate chart on transfer modal — shows rate trend over past 30 days to help user decide timing.

- **Build status:** Partial (currency_id/exchange_rate fields exist on transactions; exchange_rate table, forex gain/loss, revaluation — New).

---

### 3.11 Cash & Petty Cash Accounts

- **Purpose:** Track physical cash holdings and petty cash funds as separate account types with the same transaction and reconciliation capabilities as bank accounts.

- **Zoho Books behaviour:**
  - Account type: `cash`; appears in Banking module alongside bank accounts.
  - Default cash account: auto-selected when payment mode = Cash on any payment form.
  - Primary account flag: overrides default for "Deposit To" and "Paid Through" fields everywhere.
  - Petty cash: typically a named `cash` account with small opening balance; expenses paid out directly debit petty cash.
  - Manual transactions only (no feed); import from CSV supported.
  - Reconciliation: supported same as bank accounts; user enters closing cash-count balance and checks off transactions.
  - No feed connection available (physical cash has no data feed).

- **Data model:** Uses same `bank_accounts` table with `account_type = 'cash'`; `feed_provider = NULL`; `feed_status = NULL`. All transaction, categorization, and reconciliation tables shared.

- **API (contract-first):** Fully covered by `bank_accounts` and `bank_transactions` endpoints above; `?type=cash` filter on `GET /api/bank-accounts` returns cash accounts specifically.

  Additional:
  - `GET    /api/bank-accounts/:id/petty-cash-summary` — `{ opening_balance, total_in, total_out, current_balance, period }` — formatted for petty cash float report.

- **Workflow / state machine:** Same as §3.7 Reconciliation; cash accounts have no feed state machine.

- **Automations:**
  - Low-balance alert: if cash account balance falls below configurable threshold (e.g., < ₹500 or < $20), notify owner.
  - Petty cash replenishment suggestion: when balance falls below threshold, generate a draft expense reimbursement or transfer to top up.

- **Personalized / better-than-Zoho:**
  - Petty cash float report with running balance grid (Zoho shows only ledger view).
  - Replenishment workflow built in: one-click draft transfer from main bank to petty cash when low alert fires.
  - Cash count reconciliation: UI shows "entered cash count" vs. "book balance" with variance highlighted — designed for physical cash-count workflow.

- **Build status:** Partial (cash account type in schema; float report, low-balance alert, replenishment — New).

---

## Cross-Cutting Concerns for Section 3

### Audit Ledger Integration
Every mutation in this section (account create/update/delete, transaction status change, rule create/apply, match/unmatch, reconcile/undo-reconcile, transfer, deposit) writes a record to the tamper-evident hash-chained audit ledger:
```
audit_log_entries
  id            int autoincrement PK
  entity_type   varchar(100)   -- 'bank_account','bank_transaction','bank_rule', etc.
  entity_id     int
  action        varchar(50)    -- 'create','update','delete','categorize','match','reconcile', etc.
  actor_id      int            -- user_id; 0 = system/cron
  before_state  json nullable
  after_state   json nullable
  occurred_at   timestamp default current_timestamp
  prev_hash     varchar(64)    -- SHA-256 of previous entry's hash
  entry_hash    varchar(64)    -- SHA-256(prev_hash + entity_type + entity_id + action + occurred_at + after_state)
```
Verification endpoint: `GET /api/audit/verify-chain?from=&to=` returns chain integrity status.

### OpenAPI / Orval Contract Pattern
All endpoints follow contract-first: OpenAPI 3.1 spec written first → Orval generates TanStack Query hooks + Zod schemas. No FK constraints in MariaDB; referential integrity enforced in Express route handlers. All mutations follow: `db.insert/update/delete` → `db.select({ where: eq(table.id, insertedId) })` → return first row.

### Drizzle Custom Types Used
- `decimal(15,2)` for all monetary amounts.
- `decimal(15,6)` for exchange rates.
- Custom `json` type (Drizzle `customType`) for `tags`, `column_mapping`, `attachments`, `account_ids`.
- `text` for variable-length strings without 64K concern.
- `timestamp` with `default(sql`current_timestamp`)` for all time fields.
- `int autoincrement` for all PKs; no UUID PKs.
- No `RETURNING` — MariaDB/MySQL does not support it; always mutate then SELECT.
