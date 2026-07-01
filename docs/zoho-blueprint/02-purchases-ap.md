## 2. Purchases / Accounts Payable

The Purchases / Accounts Payable module covers the full procure-to-pay lifecycle: capturing vendor master data, raising purchase orders, receiving goods, recording bills, handling recurring costs, processing payments, and closing the loop with vendor credits and portal visibility. The Astram Financial Portal already has basic CRUD scaffolding for all major entities; this section defines the complete feature surface — status machines, approval flows, 3-way matching, landed costs, TDS/withholding, and all API contracts — required to reach parity with Zoho Books and exceed it with automation, anomaly detection, and a tamper-evident audit ledger.

**Sub-features covered:**
- Vendors (contacts, credit terms, portal access)
- Expenses (standard + mileage + receipt OCR)
- Recurring Expenses
- Purchase Orders (approval, partial receives, billed-status)
- Bills (approval, 3-way matching, landed costs, TDS withholding)
- Recurring Bills
- Payments Made (partial, bulk, refunds)
- Vendor Credits (apply-to-bill, refund)
- Vendor / Supplier Portal
- Purchase Approval Workflows (PO, bills, vendor credits)
- PO → Bill → Payment 3-Way Matching
- Landed Costs
- TDS / Withholding on Bills

---

### Vendors

- **Purpose:** Master record for all suppliers; drives auto-fill on every purchase transaction and controls portal access.

- **Zoho Books behaviour:**
  - Contact types: `vendor` or `customer_vendor` (dual-role).
  - Fields: display name, company name, salutation, primary + secondary contacts (email, phone, mobile), billing/shipping addresses, currency, payment terms (Net 15/30/45/60/90, Due on Receipt, End of Month, custom), credit limit, portal invitation, PAN/tax registration numbers, opening balance, notes, custom fields, reporting tags.
  - Payment terms cascade to new bills; credit limit blocks bill creation when exceeded (optional warning vs. hard block).
  - Vendor portal invite: email sent → vendor sets password → gets own login.
  - Merge vendors, bulk import (CSV/XLS), export.
  - Transaction history: all POs, bills, payments, credits visible from vendor detail.

- **Data model:**

  ```
  vendors
    id               int autoincrement PK
    org_id           int
    vendor_number    varchar(50) unique
    display_name     varchar(255)
    company_name     varchar(255)
    contact_type     enum('vendor','customer_vendor')
    email            varchar(255)
    phone            varchar(50)
    mobile           varchar(50)
    currency_id      int
    payment_terms    varchar(50)          -- 'net30', 'net60', 'due_on_receipt', etc.
    payment_terms_days int                -- for custom
    credit_limit     decimal(15,2)
    opening_balance  decimal(15,2)
    tax_id           varchar(50)          -- PAN, GST, VAT reg
    portal_status    enum('not_invited','invited','active','disabled')
    portal_email     varchar(255)
    notes            text
    is_active        tinyint(1) default 1
    custom_fields    json
    tags             json
    created_at       timestamp
    updated_at       timestamp
    audit_hash       varchar(64)

  vendor_contacts
    id               int autoincrement PK
    vendor_id        int
    salutation       varchar(20)
    first_name       varchar(100)
    last_name        varchar(100)
    email            varchar(255)
    phone            varchar(50)
    mobile           varchar(50)
    is_primary       tinyint(1)

  vendor_addresses
    id               int autoincrement PK
    vendor_id        int
    address_type     enum('billing','shipping')
    attention        varchar(100)
    street           varchar(255)
    city             varchar(100)
    state            varchar(100)
    zip              varchar(20)
    country          varchar(100)
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | POST | `/api/vendors` | Create vendor; auto-generate `vendor_number`; mutate then select |
  | GET | `/api/vendors` | List with filters: `is_active`, `contact_type`, `search`, pagination |
  | GET | `/api/vendors/:id` | Full vendor with contacts, addresses, balance summary |
  | PUT | `/api/vendors/:id` | Update; mutate then select |
  | DELETE | `/api/vendors/:id` | Soft-delete (`is_active=0`) if transactions exist |
  | POST | `/api/vendors/:id/portal/invite` | Send portal invitation email |
  | DELETE | `/api/vendors/:id/portal/access` | Revoke portal access |
  | GET | `/api/vendors/:id/transactions` | Paginated POs + bills + payments + credits |
  | GET | `/api/vendors/:id/statement` | Balance statement for date range |

  Response always returns the full vendor object (mutate-then-select pattern). Portal invite triggers an email job.

- **Workflow / state machine:**

  ```
  active ←→ inactive (soft toggle)
  portal: not_invited → invited → active → disabled
  ```

  Credit limit: advisory warning at 80%; hard block (configurable) at 100%.

- **Automations:**
  - Auto-increment `vendor_number` with configurable prefix (`VND-0001`).
  - Portal invite expiry: token expires in 48 h; resend endpoint.
  - Scheduled job: weekly vendor balance aging report email.
  - Webhook: `vendor.created`, `vendor.updated`, `vendor.portal_activated`.

- **Personalized / better-than-Zoho:**
  - **Duplicate detection:** on save, fuzzy-match company name + email; surface warning before commit.
  - **Risk score:** auto-computed from payment history (avg days late, dispute rate) shown in vendor list.
  - **Audit ledger:** every field change appended to hash-chained ledger row — immutable who/what/when.
  - **Bulk re-invite:** re-send portal invites to all stale `invited` vendors older than N days.

- **Build status:** Partial (basic CRUD built; portal invite, credit limit enforcement, duplicate detection, risk score are New).

---

### Expenses

- **Purpose:** Record non-PO operational spend (travel, meals, subscriptions, mileage) with optional receipt scan, billable-to-customer support, and reimbursement tracking.

- **Zoho Books behaviour:**
  - Expense types: standard (amount + account) and mileage (distance × rate).
  - Mileage: enter distance or start/end odometer readings; system multiplies by configured mileage rate; vehicle type selectable.
  - Receipt attachment: upload image/PDF; autoscan OCR extracts date, amount, vendor name; creates draft expense.
  - Billable flag: link expense to customer + project; markup % configurable; converts to invoice line item.
  - Approval: submit → approver approves/rejects (configurable per org).
  - Multi-currency: amount in foreign currency, exchange rate, base-currency equivalent stored.
  - Reporting: by category, customer, project, employee, date range.
  - Import: CSV/XLS bulk import.
  - Expense claim add-on: per diem, policy enforcement (max amount per category), travel requests.

- **Data model:**

  ```
  expenses
    id                   int autoincrement PK
    org_id               int
    expense_number       varchar(50)
    expense_date         date
    account_id           int                    -- expense account (CoA)
    vendor_id            int nullable
    employee_id          int nullable
    expense_type         enum('standard','mileage')
    amount               decimal(15,2)
    tax_id               int nullable
    tax_amount           decimal(15,2)
    total                decimal(15,2)
    currency_id          int
    exchange_rate        decimal(15,6)
    is_billable          tinyint(1) default 0
    customer_id          int nullable
    project_id           int nullable
    markup_percent       decimal(5,2)
    reference_number     varchar(100)
    description          text
    is_personal          tinyint(1) default 0
    receipt_url          varchar(500)           -- stored file path/key
    ocr_raw              json                   -- raw OCR output
    status               enum('draft','pending_approval','approved','rejected','billed')
    mileage_type         varchar(50)
    mileage_rate         decimal(10,4)
    start_reading        decimal(10,2)
    end_reading          decimal(10,2)
    distance             decimal(10,2)
    custom_fields        json
    tags                 json
    created_by           int
    created_at           timestamp
    updated_at           timestamp
    audit_hash           varchar(64)
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | POST | `/api/expenses` | Create; mutate then select |
  | GET | `/api/expenses` | Filters: `status`, `account_id`, `customer_id`, `employee_id`, `date_from`, `date_to`, `is_billable` |
  | GET | `/api/expenses/:id` | Full expense with OCR data, receipt URL |
  | PUT | `/api/expenses/:id` | Update |
  | DELETE | `/api/expenses/:id` | Hard delete if draft; soft-delete otherwise |
  | POST | `/api/expenses/:id/receipt` | Upload receipt file (multipart); triggers OCR pipeline |
  | GET | `/api/expenses/:id/receipt` | Stream receipt file |
  | DELETE | `/api/expenses/:id/receipt` | Remove receipt |
  | POST | `/api/expenses/:id/submit` | Submit for approval |
  | POST | `/api/expenses/:id/approve` | Approve (approver role) |
  | POST | `/api/expenses/:id/reject` | Reject with reason |
  | GET | `/api/expenses/:id/comments` | Audit trail + comments |

- **Workflow / state machine:**

  ```
  draft → pending_approval → approved → billed
                          ↘ rejected → draft (resubmit)
  ```

  Expenses with `is_billable=true` transition to `billed` when added to a customer invoice.

- **Automations:**
  - Auto-number: `EXP-0001` with configurable prefix.
  - OCR pipeline: on receipt upload, call internal OCR service (Tesseract or cloud vision API); parse date, amount, merchant; pre-fill expense fields; store raw JSON in `ocr_raw`.
  - Mileage auto-calc: `distance = end_reading - start_reading`; `amount = distance × mileage_rate`.
  - Scheduled job: flag unreimbursed approved expenses older than 30 days.
  - Webhook: `expense.approved`, `expense.rejected`.

- **Personalized / better-than-Zoho:**
  - **Smart OCR with confidence score:** show confidence % per extracted field; low-confidence fields highlighted for user review.
  - **Duplicate receipt detection:** perceptual hash of uploaded image; warn if same receipt uploaded before (prevents double-claiming).
  - **Anomaly detection:** flag expenses > 2σ from user's historical average for same category; surfaces for approver attention.
  - **Google Maps mileage:** optionally compute distance via route (origin → destination) rather than manual odometer.
  - **Audit ledger:** every status change + field edit recorded immutably.

- **Build status:** Partial (basic CRUD built; OCR pipeline, mileage auto-calc, approval workflow, anomaly detection are New).

---

### Recurring Expenses

- **Purpose:** Auto-generate expense records on a schedule for fixed recurring costs (rent, subscriptions, retainers).

- **Zoho Books behaviour:**
  - Recurrence profile linked to an expense template.
  - Frequency: daily, weekly, monthly, yearly, custom interval.
  - Start date + optional end date (or never-ending).
  - On trigger: a new expense is created in `draft` or `approved` state (configurable).
  - Can be stopped/resumed.
  - History log of all generated expenses.

- **Data model:**

  ```
  recurring_expenses
    id                   int autoincrement PK
    org_id               int
    recurrence_name      varchar(100)
    account_id           int
    vendor_id            int nullable
    employee_id          int nullable
    amount               decimal(15,2)
    tax_id               int nullable
    currency_id          int
    is_billable          tinyint(1)
    customer_id          int nullable
    project_id           int nullable
    description          text
    frequency            enum('daily','weekly','monthly','yearly','custom')
    repeat_every         int default 1
    start_date           date
    end_date             date nullable
    next_expense_date    date
    status               enum('active','stopped')
    auto_approve         tinyint(1) default 0
    custom_fields        json
    created_at           timestamp
    updated_at           timestamp
    audit_hash           varchar(64)
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | POST | `/api/recurring-expenses` | Create profile; mutate then select |
  | GET | `/api/recurring-expenses` | Filters: `status`, `vendor_id`, `account_id` |
  | GET | `/api/recurring-expenses/:id` | Profile + generated expense history |
  | PUT | `/api/recurring-expenses/:id` | Update profile |
  | DELETE | `/api/recurring-expenses/:id` | Delete profile (does not delete generated expenses) |
  | POST | `/api/recurring-expenses/:id/stop` | Pause generation |
  | POST | `/api/recurring-expenses/:id/resume` | Resume generation |
  | GET | `/api/recurring-expenses/:id/history` | List all expenses generated from this profile |

- **Workflow / state machine:**

  ```
  active → stopped → active (resume)
         → deleted
  ```

  Scheduler fires daily; generates expense if `next_expense_date <= today` and `status = active`. After generation, advances `next_expense_date`.

- **Automations:**
  - Daily cron job: scan all active profiles due today; generate expense rows; advance `next_expense_date`; send email notification to creator.
  - If `auto_approve=true`, generated expense starts in `approved`; otherwise `draft`.
  - Webhook: `recurring_expense.generated`.

- **Personalized / better-than-Zoho:**
  - **Smart pause:** auto-pause recurring expense if vendor is deactivated; resume on vendor re-activation.
  - **Cost drift alert:** if the same recurring expense amount changes > 10% vs. last 3 occurrences, flag for review.
  - **Audit ledger:** profile changes + every generation event recorded immutably.

- **Build status:** Partial (basic CRUD built; scheduler, smart pause, cost drift alert are New).

---

### Purchase Orders

- **Purpose:** Formal procurement document sent to a vendor before goods/services are received; drives receiving, bill generation, and 3-way matching.

- **Zoho Books behaviour:**
  - Statuses: `draft`, `open` (issued to vendor), `partially_billed`, `billed`, `cancelled`.
  - Line items: item, quantity, rate, discount, tax, account; quantity received tracked per line.
  - Delivery address: billing or custom shipping address.
  - Expected delivery date per PO.
  - Approval: submit → approve/reject (multi-level configurable).
  - Convert to bill: one-click; quantity not-yet-billed pre-fills bill line items.
  - Partial receives: record goods receipt voucher against PO lines; each line tracks `qty_ordered`, `qty_received`, `qty_billed`.
  - Email to vendor with PDF attachment.
  - Vendor portal: vendor can accept/decline; comment thread.
  - Templates: customizable PDF template.
  - Import/export: CSV/XLS.
  - Custom fields, reporting tags.

- **Data model:**

  ```
  purchase_orders
    id                      int autoincrement PK
    org_id                  int
    po_number               varchar(50) unique
    vendor_id               int
    date                    date
    expected_delivery_date  date nullable
    reference_number        varchar(100)
    currency_id             int
    exchange_rate           decimal(15,6) default 1
    discount                decimal(15,2) default 0
    discount_type           enum('percent','amount')
    discount_account_id     int nullable
    is_discount_before_tax  tinyint(1) default 1
    shipping_address        json
    billing_address         json
    subtotal                decimal(15,2)
    tax_total               decimal(15,2)
    discount_total          decimal(15,2)
    total                   decimal(15,2)
    status                  enum('draft','submitted','approved','rejected','open','partially_billed','billed','cancelled')
    delivery_status         enum('not_received','partially_received','received')
    notes                   text
    terms                   text
    template_id             int nullable
    custom_fields           json
    tags                    json
    created_by              int
    approved_by             int nullable
    approved_at             timestamp nullable
    created_at              timestamp
    updated_at              timestamp
    audit_hash              varchar(64)

  purchase_order_line_items
    id                int autoincrement PK
    po_id             int
    item_id           int nullable
    account_id        int
    name              varchar(255)
    description       text
    quantity          decimal(15,4)
    unit              varchar(50)
    rate              decimal(15,4)
    discount          decimal(15,2)
    tax_id            int nullable
    tax_percent       decimal(5,2)
    line_total        decimal(15,2)
    qty_received      decimal(15,4) default 0
    qty_billed        decimal(15,4) default 0

  po_receives (goods receipt vouchers)
    id                int autoincrement PK
    org_id            int
    po_id             int
    receive_number    varchar(50)
    receive_date      date
    notes             text
    created_by        int
    created_at        timestamp
    audit_hash        varchar(64)

  po_receive_lines
    id                int autoincrement PK
    receive_id        int
    po_line_id        int
    qty_received      decimal(15,4)
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | POST | `/api/purchase-orders` | Create; auto-number; mutate then select |
  | GET | `/api/purchase-orders` | Filters: `status`, `vendor_id`, `date_from`, `date_to`, `delivery_status` |
  | GET | `/api/purchase-orders/:id` | Full PO with line items, receives, linked bills |
  | PUT | `/api/purchase-orders/:id` | Update if `draft` or `approved` |
  | DELETE | `/api/purchase-orders/:id` | Delete if `draft` only |
  | POST | `/api/purchase-orders/:id/submit` | Submit for approval |
  | POST | `/api/purchase-orders/:id/approve` | Approve → status `open` |
  | POST | `/api/purchase-orders/:id/reject` | Reject with reason |
  | POST | `/api/purchase-orders/:id/cancel` | Cancel open PO |
  | POST | `/api/purchase-orders/:id/email` | Email PDF to vendor |
  | POST | `/api/purchase-orders/:id/receives` | Record goods receipt; updates `qty_received` per line; mutate then select |
  | GET | `/api/purchase-orders/:id/receives` | List all receives for this PO |
  | POST | `/api/purchase-orders/:id/convert-to-bill` | Generate bill from unbilled quantity; mutate then select |
  | GET | `/api/purchase-orders/:id/comments` | Audit trail + comments |
  | POST | `/api/purchase-orders/:id/comments` | Add comment |
  | POST | `/api/purchase-orders/:id/attachment` | Attach document |

- **Workflow / state machine:**

  ```
  draft → submitted → approved → open → partially_billed → billed
                   ↘ rejected → draft
  open → cancelled
  draft → cancelled

  delivery_status: not_received → partially_received → received  (driven by po_receives)
  billed_status:  (not_billed) → partially_billed → billed       (driven by bills linking back)
  ```

- **Automations:**
  - Auto-number: `PO-0001` with configurable prefix + fiscal year reset.
  - Expected delivery reminder: email/notification N days before `expected_delivery_date` if `delivery_status != received`.
  - Auto-status: after each receive, recompute `delivery_status`; after each bill link, recompute billed status.
  - Webhook: `po.approved`, `po.received`, `po.billed`.

- **Personalized / better-than-Zoho:**
  - **Vendor accept/decline in portal** with comment thread (native portal parity) and real-time push notification to buyer.
  - **Delivery variance alert:** if `qty_received > qty_ordered` for any line, flag discrepancy and block further receives until approved.
  - **Auto-convert on full receipt:** when `delivery_status` flips to `received`, offer one-click "Create Bill" prompt in UI with pre-filled amounts.
  - **Audit ledger:** every status transition and field edit chained and immutable.
  - **Price drift detection:** if a PO line rate differs > 5% from last 3 POs to same vendor for same item, surface warning.

- **Build status:** Partial (basic CRUD built; approval workflow, receives, 3-way matching, auto-convert, delivery alerts are New).

---

### Bills

- **Purpose:** Record vendor invoices (payables) against received goods/services; the core AP transaction that drives payment and GL postings.

- **Zoho Books behaviour:**
  - Created manually, converted from PO, or uploaded via vendor portal and auto-scanned.
  - Statuses: `draft`, `open`, `partially_paid`, `paid`, `overdue` (computed), `void`.
  - Line items: item or account, quantity, rate, discount, tax, billable-to-customer flag.
  - PO linkage: attach one or more open POs to a bill; unused PO quantity tracked.
  - 3-way matching: compare bill qty/rate against PO and against goods receives; discrepancy report surfaced to user before save.
  - Approval: submit → approve/reject (same workflow engine as PO).
  - Apply vendor credits: via "Use Credits" — credits applied reduce bill balance.
  - Partial payments: multiple payments against one bill; balance tracked.
  - Billing address update per bill.
  - Landed costs: allocate additional charges (freight, customs) from a landed-cost bill across inventory item lines using qty, value, weight, or dimensions.
  - TDS / Withholding: per line item, select TDS rate; system deducts TDS from payment amount and posts to TDS payable GL account; TDS certificates generated.
  - Void: reverses journal entries; bill cannot be deleted if paid.
  - Journal: double-entry posted on approval or on `open` (configurable).
  - Import/export: CSV/XLS.
  - Comments + history.

- **Data model:**

  ```
  bills
    id                      int autoincrement PK
    org_id                  int
    bill_number             varchar(50)
    vendor_id               int
    date                    date
    due_date                date
    payment_terms           varchar(50)
    reference_number        varchar(100)
    order_number            varchar(100)          -- vendor's PO/ref
    currency_id             int
    exchange_rate           decimal(15,6) default 1
    subtotal                decimal(15,2)
    tax_total               decimal(15,2)
    discount_total          decimal(15,2)
    tds_total               decimal(15,2) default 0
    adjustment              decimal(15,2) default 0
    adjustment_description  varchar(255)
    total                   decimal(15,2)
    balance                 decimal(15,2)
    status                  enum('draft','submitted','approved','rejected','open','partially_paid','paid','void')
    billing_address         json
    notes                   text
    terms                   text
    is_inclusive_tax        tinyint(1) default 0
    recurring_bill_id       int nullable
    source                  enum('manual','po_conversion','vendor_portal','recurring','import')
    template_id             int nullable
    custom_fields           json
    tags                    json
    created_by              int
    approved_by             int nullable
    approved_at             timestamp nullable
    voided_by               int nullable
    voided_at               timestamp nullable
    created_at              timestamp
    updated_at              timestamp
    audit_hash              varchar(64)

  bill_line_items
    id                int autoincrement PK
    bill_id           int
    po_line_id        int nullable         -- links back to PO line for matching
    item_id           int nullable
    account_id        int
    name              varchar(255)
    description       text
    quantity          decimal(15,4)
    rate              decimal(15,4)
    discount          decimal(15,2)
    tax_id            int nullable
    tax_percent       decimal(5,2)
    tds_id            int nullable         -- TDS rate reference
    tds_percent       decimal(5,2)
    tds_amount        decimal(15,2)
    is_billable       tinyint(1) default 0
    customer_id       int nullable
    project_id        int nullable
    markup_percent    decimal(5,2)
    line_total        decimal(15,2)

  bill_po_links
    id          int autoincrement PK
    bill_id     int
    po_id       int

  bill_landed_costs
    id                   int autoincrement PK
    bill_id              int                  -- the "landed cost bill" providing charges
    target_bill_id       int                  -- the bill whose lines receive allocation
    allocation_method    enum('quantity','value','weight','dimensions')
    total_allocated      decimal(15,2)
    created_at           timestamp
    audit_hash           varchar(64)

  bill_landed_cost_lines
    id              int autoincrement PK
    lc_id           int
    bill_line_id    int
    allocated_amount decimal(15,2)
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | POST | `/api/bills` | Create; auto-number; mutate then select |
  | GET | `/api/bills` | Filters: `status`, `vendor_id`, `date_from`, `date_to`, `due_date_from`, `due_date_to`, `overdue=true` |
  | GET | `/api/bills/:id` | Full bill with lines, payments, credits applied, matching report |
  | PUT | `/api/bills/:id` | Update if `draft` or `open` (not void/paid) |
  | DELETE | `/api/bills/:id` | Delete `draft` only |
  | POST | `/api/bills/:id/submit` | Submit for approval |
  | POST | `/api/bills/:id/approve` | Approve → `open`; triggers journal entry |
  | POST | `/api/bills/:id/reject` | Reject with reason |
  | POST | `/api/bills/:id/void` | Void; reverse journal; mutate then select |
  | POST | `/api/bills/:id/open` | Re-open from `draft` |
  | GET | `/api/bills/:id/payments` | List all payments applied |
  | POST | `/api/bills/:id/credits` | Apply vendor credits; body: `[{vendor_credit_id, amount}]`; mutate then select |
  | DELETE | `/api/bills/:id/payments/:payment_id` | Remove payment application |
  | POST | `/api/bills/:id/attachment` | Attach document |
  | GET | `/api/bills/:id/matching-report` | 3-way match result: PO qty, received qty, billed qty, rate variances |
  | POST | `/api/bills/:id/landed-costs` | Allocate landed costs to this bill's lines |
  | GET | `/api/bills/:id/journal` | View double-entry journal for this bill |
  | GET | `/api/bills/:id/comments` | Comments + history |
  | POST | `/api/bills/:id/comments` | Add comment |

- **Workflow / state machine:**

  ```
  draft → submitted → approved → open → partially_paid → paid
                   ↘ rejected → draft
  open/partially_paid → void
  draft → void

  overdue: computed field — due_date < today AND status IN (open, partially_paid)
  ```

- **Automations:**
  - Auto-number: `BILL-0001` with prefix + fiscal year reset.
  - Overdue detection: nightly job flags bills past due date; sends payment reminder email.
  - Auto-apply credits: on bill approval, if vendor has unused credits, prompt (or auto-apply per org preference).
  - Due date from payment terms: auto-calculate on vendor/terms selection.
  - Webhook: `bill.approved`, `bill.paid`, `bill.overdue`, `bill.voided`.

- **Personalized / better-than-Zoho:**
  - **Automated 3-way match on save:** before `open` status, auto-run matching logic; block approval if qty or rate variance > configurable threshold (e.g., 5%); show discrepancy table.
  - **Inline TDS certificate generation:** one-click PDF TDS certificate from bill detail page.
  - **Anomaly detection:** if bill total from a vendor spikes > 3× 90-day average, add a soft block requiring manager override.
  - **Vendor portal upload → auto-OCR → draft bill:** vendor uploads invoice in portal; OCR pre-fills bill fields; routed to AP clerk for review.
  - **Audit ledger:** every status change + field edit chained immutably with hash.
  - **GL preview:** show projected journal entries before approving — reviewer sees debit/credit before committing.

- **Build status:** Partial (basic CRUD built; 3-way matching, TDS, landed costs, GL journal posting, anomaly detection, approval workflow, portal OCR intake are New).

---

### Recurring Bills

- **Purpose:** Auto-generate bills on a schedule for fixed recurring vendor charges (rent, SaaS subscriptions, maintenance retainers).

- **Zoho Books behaviour:**
  - Profile stores vendor, line items, frequency, start/end dates.
  - On trigger date, a new bill is created (draft or open per preference).
  - Stop/resume profile; history of all generated bills.
  - No separate API for recurring vs. one-time bills — generated bills are standard bill records with a `recurring_bill_id` pointer.

- **Data model:**

  ```
  recurring_bills
    id                   int autoincrement PK
    org_id               int
    recurrence_name      varchar(100)
    vendor_id            int
    payment_terms        varchar(50)
    currency_id          int
    line_items           json                  -- serialized line items template
    notes                text
    terms                text
    frequency            enum('daily','weekly','monthly','yearly','custom')
    repeat_every         int default 1
    start_date           date
    end_date             date nullable
    next_bill_date       date
    status               enum('active','stopped')
    auto_approve         tinyint(1) default 0
    custom_fields        json
    created_at           timestamp
    updated_at           timestamp
    audit_hash           varchar(64)
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | POST | `/api/recurring-bills` | Create profile; mutate then select |
  | GET | `/api/recurring-bills` | Filters: `status`, `vendor_id` |
  | GET | `/api/recurring-bills/:id` | Profile + bill history |
  | PUT | `/api/recurring-bills/:id` | Update profile |
  | DELETE | `/api/recurring-bills/:id` | Delete profile (bills remain) |
  | POST | `/api/recurring-bills/:id/stop` | Pause |
  | POST | `/api/recurring-bills/:id/resume` | Resume |
  | GET | `/api/recurring-bills/:id/history` | List all generated bills |

- **Workflow / state machine:**

  ```
  active → stopped → active (resume)
         → deleted
  ```

  Daily cron: for each active profile where `next_bill_date <= today`, generate bill, advance `next_bill_date` by frequency interval.

- **Automations:**
  - Daily cron job with retry on failure (up to 3×; alert on final failure).
  - Generated bill status: `draft` (default) or `open` if `auto_approve=true`.
  - Email notification to AP owner on each generation.
  - Webhook: `recurring_bill.generated`.

- **Personalized / better-than-Zoho:**
  - **Smart stop:** auto-stop profile if vendor is deactivated; notification sent.
  - **Amount change detection:** if `line_items.rate` on template changes > 10% vs. previous generation, send alert before generating.
  - **Audit ledger:** profile edits + each generation event recorded immutably.

- **Build status:** Partial (basic CRUD built; scheduler, smart stop, amount-change alert are New).

---

### Payments Made

- **Purpose:** Record cash/bank outflows to vendors against one or more open bills, with support for partial payments, bulk payments, refunds, and payment-mode tracking.

- **Zoho Books behaviour:**
  - One payment can be applied to multiple bills simultaneously.
  - Payment modes: Cash, Check, Bank Transfer, Credit Card, PayPal, ACH, and custom.
  - Check payments: print check (check number, bank routing); schedule print date.
  - ACH: via CSG Forte integration (external).
  - Excess payment: amount > bills total creates prepayment credit (stored as unused vendor credit or advance).
  - Refund: vendor refunds overpayment → refund record against payment.
  - Filters: by vendor, bill, payment mode, date range, reference number.
  - Email payment advice to vendor.
  - Foreign currency: records payment in payment currency + base currency equivalent.

- **Data model:**

  ```
  payments_made
    id                    int autoincrement PK
    org_id                int
    payment_number        varchar(50)
    vendor_id             int
    date                  date
    amount                decimal(15,2)
    currency_id           int
    exchange_rate         decimal(15,6) default 1
    paid_through_account_id int             -- bank/cash account
    payment_mode          varchar(50)
    reference_number      varchar(100)
    description           text
    check_number          varchar(50)
    check_date            date nullable
    is_printed            tinyint(1) default 0
    unused_amount         decimal(15,2) default 0
    custom_fields         json
    tags                  json
    created_by            int
    created_at            timestamp
    updated_at            timestamp
    audit_hash            varchar(64)

  payment_bill_applications
    id              int autoincrement PK
    payment_id      int
    bill_id         int
    amount_applied  decimal(15,2)

  payment_refunds
    id              int autoincrement PK
    payment_id      int
    refund_date     date
    amount          decimal(15,2)
    account_id      int
    reference_number varchar(100)
    description     text
    created_at      timestamp
    audit_hash      varchar(64)
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | POST | `/api/payments-made` | Create with `bills[]` array for multi-bill application; mutate then select |
  | GET | `/api/payments-made` | Filters: `vendor_id`, `bill_id`, `payment_mode`, `date_from`, `date_to`, `search` |
  | GET | `/api/payments-made/:id` | Full payment with bill applications, refunds |
  | PUT | `/api/payments-made/:id` | Update (limited to metadata if bills applied) |
  | DELETE | `/api/payments-made/:id` | Delete; reverses bill balance; mutate then select |
  | POST | `/api/payments-made/:id/email` | Email payment advice to vendor |
  | POST | `/api/payments-made/:id/refunds` | Record vendor refund; mutate then select |
  | GET | `/api/payments-made/:id/refunds` | List refunds |
  | PUT | `/api/payments-made/:id/refunds/:rid` | Update refund |
  | DELETE | `/api/payments-made/:id/refunds/:rid` | Delete refund |
  | POST | `/api/payments-made/bulk` | Create one payment applied to multiple bills in one request |

  All mutations use mutate-then-select (no RETURNING).

- **Workflow / state machine:**

  ```
  created → (applied to bills; bills update balance)
  excess amount → unused_amount stored (acts as vendor credit/advance)
  refund created → unused_amount decremented
  deleted → bill balances restored
  ```

- **Automations:**
  - Auto-number: `PMT-0001` with prefix.
  - On payment creation: auto-update bill `balance` and `status` (partially_paid / paid) for each applied bill.
  - Webhook: `payment_made.created`, `payment_made.deleted`.
  - Nightly: report unpresented checks older than 90 days.

- **Personalized / better-than-Zoho:**
  - **Batch payment queue:** UI allows selecting N overdue bills across multiple vendors, then generates one payment per vendor in a batch; one-click execution.
  - **Bank feed matching:** when bank transactions are imported, auto-suggest matching payments-made records by amount + date ± 3 days.
  - **Audit ledger:** every payment and refund chained immutably.
  - **Duplicate payment detection:** warn if a payment with the same amount + vendor + date already exists within 24 hours.

- **Build status:** Partial (basic CRUD built; bulk payment, refunds, bank feed matching, duplicate detection are New).

---

### Vendor Credits

- **Purpose:** Track credits owed by a vendor (from returns, overpayments, disputes); apply them to open bills or request a cash refund.

- **Zoho Books behaviour:**
  - Created manually or auto-generated from a vendor debit note / returned goods.
  - Statuses: `draft`, `open`, `partially_used`, `used` (fully applied or refunded), `void`.
  - Apply to one or more bills (partial or full credit amount per bill).
  - Refund: vendor issues a cash refund for the credit balance → refund record closes the credit.
  - Approval: submit → approve/reject (same workflow).
  - Line items: mirror bill structure (account, item, qty, rate, tax).
  - Foreign currency support.
  - Comments + history.

- **Data model:**

  ```
  vendor_credits
    id                   int autoincrement PK
    org_id               int
    credit_number        varchar(50)
    vendor_id            int
    date                 date
    currency_id          int
    exchange_rate        decimal(15,6) default 1
    reference_number     varchar(100)
    total                decimal(15,2)
    balance              decimal(15,2)
    total_credits_used   decimal(15,2) default 0
    total_refunded       decimal(15,2) default 0
    status               enum('draft','submitted','approved','rejected','open','partially_used','used','void')
    notes                text
    custom_fields        json
    tags                 json
    created_by           int
    approved_by          int nullable
    created_at           timestamp
    updated_at           timestamp
    audit_hash           varchar(64)

  vendor_credit_line_items
    id            int autoincrement PK
    credit_id     int
    item_id       int nullable
    account_id    int
    name          varchar(255)
    quantity      decimal(15,4)
    rate          decimal(15,4)
    tax_id        int nullable
    tax_percent   decimal(5,2)
    line_total    decimal(15,2)

  vendor_credit_applications
    id              int autoincrement PK
    credit_id       int
    bill_id         int
    amount_applied  decimal(15,2)
    applied_date    date
    audit_hash      varchar(64)

  vendor_credit_refunds
    id              int autoincrement PK
    credit_id       int
    refund_date     date
    amount          decimal(15,2)
    account_id      int
    reference_number varchar(100)
    description     text
    created_at      timestamp
    audit_hash      varchar(64)
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | POST | `/api/vendor-credits` | Create; mutate then select |
  | GET | `/api/vendor-credits` | Filters: `status`, `vendor_id`, `date_from`, `date_to` |
  | GET | `/api/vendor-credits/:id` | Full credit with lines, applications, refunds |
  | PUT | `/api/vendor-credits/:id` | Update if `draft` |
  | DELETE | `/api/vendor-credits/:id` | Delete `draft` only |
  | POST | `/api/vendor-credits/:id/submit` | Submit for approval |
  | POST | `/api/vendor-credits/:id/approve` | Approve → `open` |
  | POST | `/api/vendor-credits/:id/reject` | Reject with reason |
  | POST | `/api/vendor-credits/:id/void` | Void; reverse applications |
  | POST | `/api/vendor-credits/:id/bills` | Apply credit to bill(s); body: `[{bill_id, amount}]`; mutate then select |
  | GET | `/api/vendor-credits/:id/bills` | List bill applications |
  | DELETE | `/api/vendor-credits/:id/bills/:application_id` | Remove credit application |
  | POST | `/api/vendor-credits/:id/refunds` | Record cash refund from vendor |
  | GET | `/api/vendor-credits/:id/refunds` | List refunds |
  | PUT | `/api/vendor-credits/:id/refunds/:rid` | Update refund |
  | DELETE | `/api/vendor-credits/:id/refunds/:rid` | Delete refund |
  | GET | `/api/vendor-credits/refunds` | List all credit refunds (org-wide) |
  | GET | `/api/vendor-credits/:id/comments` | Comments + history |

- **Workflow / state machine:**

  ```
  draft → submitted → approved → open → partially_used → used
                   ↘ rejected → draft
  open/partially_used → void
  ```

  `balance = total - total_credits_used - total_refunded`; status auto-computed on each application or refund.

- **Automations:**
  - Auto-number: `VC-0001`.
  - On application: update bill balance; re-compute credit balance and status; mutate then select.
  - Webhook: `vendor_credit.applied`, `vendor_credit.refunded`.

- **Personalized / better-than-Zoho:**
  - **Auto-suggest:** when viewing an open bill, surface any unused vendor credits for this vendor with one-click apply.
  - **Credit aging:** nightly job flags credits unused for > 90 days; email AP team.
  - **Audit ledger:** every status change and application chained immutably.

- **Build status:** Partial (basic CRUD built; approval workflow, auto-suggest, credit aging alert are New).

---

### Vendor / Supplier Portal

- **Purpose:** Branded self-service portal where vendors view POs, upload invoices, track payment status, generate statements, and collaborate — reducing AP back-and-forth.

- **Zoho Books behaviour:**
  - Access: invite-only per contact; vendor creates password via email link.
  - What vendors see: all POs (can accept/decline), uploaded documents, accepted invoices, payment history, available credits, account statements.
  - Document upload: vendor uploads invoice PDF/image; enters into `pending` state in Zoho Books; AP team reviews → accepts (converts to bill) or rejects.
  - Autoscan: if enabled, uploaded documents are OCR-scanned automatically.
  - Comments: threaded on POs and invoices.
  - Form W-9: vendor can generate/upload directly.
  - Configurable permissions: edit contact info, upload documents, PO acceptance, custom banner message.
  - Notifications: email when PO is sent, payment is recorded.

- **Data model:**

  ```
  vendor_portal_sessions
    id              int autoincrement PK
    vendor_id       int
    contact_id      int
    token_hash      varchar(64)       -- invite/auth token hash
    token_expires   timestamp
    last_login      timestamp nullable
    is_active       tinyint(1) default 1
    created_at      timestamp

  vendor_portal_documents
    id              int autoincrement PK
    org_id          int
    vendor_id       int
    uploaded_by_contact_id int
    file_name       varchar(255)
    file_key        varchar(500)      -- storage path
    file_size       int
    mime_type       varchar(100)
    status          enum('pending','accepted','rejected')
    rejection_reason text nullable
    linked_bill_id  int nullable      -- set after acceptance/conversion
    ocr_raw         json nullable
    ocr_confidence  decimal(5,2)
    notes           text
    uploaded_at     timestamp
    reviewed_by     int nullable
    reviewed_at     timestamp nullable
    audit_hash      varchar(64)
  ```

- **API (contract-first):**

  **Internal (AP team):**

  | Method | Path | Notes |
  |--------|------|-------|
  | POST | `/api/vendors/:id/portal/invite` | Send/re-send invitation email |
  | DELETE | `/api/vendors/:id/portal/access` | Revoke access |
  | GET | `/api/vendor-portal/documents` | List pending documents; filters: `status`, `vendor_id` |
  | POST | `/api/vendor-portal/documents/:id/accept` | Accept → trigger bill creation from document; mutate then select |
  | POST | `/api/vendor-portal/documents/:id/reject` | Reject with reason |

  **Portal-facing (vendor-authenticated routes):**

  | Method | Path | Notes |
  |--------|------|-------|
  | POST | `/api/portal/auth/login` | Vendor login (email + password); returns JWT |
  | GET | `/api/portal/purchase-orders` | Vendor's POs |
  | POST | `/api/portal/purchase-orders/:id/accept` | Vendor accepts PO |
  | POST | `/api/portal/purchase-orders/:id/decline` | Vendor declines PO with reason |
  | POST | `/api/portal/documents` | Upload invoice document (multipart) |
  | GET | `/api/portal/documents` | List own uploaded documents + status |
  | GET | `/api/portal/bills` | List accepted bills + payment status |
  | GET | `/api/portal/payments` | List payments received |
  | GET | `/api/portal/credits` | Available credits |
  | GET | `/api/portal/statement` | Statement for date range |
  | POST | `/api/portal/comments` | Add comment on PO or bill |

- **Workflow / state machine:**

  ```
  invite: not_invited → invited (token) → active (first login) → disabled
  document: pending → accepted (→ bill created) | rejected
  PO: open → vendor_accepted | vendor_declined
  ```

- **Automations:**
  - Invite token: 48-hour expiry; auto-resend reminder at 24 hours if not activated.
  - Document OCR: on vendor upload, async OCR job runs; results stored in `ocr_raw`; AP notified.
  - Email: notify AP team on new document upload; notify vendor on payment recorded.
  - Webhook: `portal.document_uploaded`, `portal.po_accepted`, `portal.po_declined`.

- **Personalized / better-than-Zoho:**
  - **Two-factor authentication** option for portal login (TOTP).
  - **Real-time status tracker:** vendor sees bill move through statuses (pending → draft → approved → paid) with progress indicator.
  - **Smart OCR extraction displayed to vendor:** show vendor the extracted fields so they can flag mismatches before submission.
  - **Self-service W-9/W-8BEN upload** with validation and expiry tracking.
  - **Audit ledger:** all portal activity (login, upload, accept/decline) recorded immutably.

- **Build status:** New.

---

### Purchase Approval Workflows

- **Purpose:** Configurable multi-level approval gates on POs, bills, and vendor credits before they become actionable; ensures segregation of duties.

- **Zoho Books behaviour:**
  - Enabled per module (PO, Bill, Vendor Credit) independently.
  - Approval types: Simple (any one approver), Multi-Level (sequential hierarchy), Custom (criteria-based routing).
  - Approver roles: any Admin or named Approver user.
  - Flow: submitter clicks "Save and Submit" → approver receives in-app + email notification → approves or rejects with reason.
  - Multi-level: each level must approve in sequence; admin can "Final Approve" to bypass remaining levels.
  - Rejection: submitter notified; can edit and resubmit.
  - Unapproved transactions cannot be emailed, converted, or paid.

- **Data model:**

  ```
  approval_policies
    id                int autoincrement PK
    org_id            int
    module            enum('purchase_order','bill','vendor_credit','expense')
    policy_type       enum('simple','multi_level','custom')
    is_enabled        tinyint(1) default 1
    created_at        timestamp
    updated_at        timestamp

  approval_policy_levels
    id                int autoincrement PK
    policy_id         int
    level_order       int
    approver_type     enum('any_admin','specific_user','role')
    approver_user_id  int nullable
    approver_role     varchar(50) nullable

  approval_requests
    id                int autoincrement PK
    org_id            int
    module            varchar(50)
    entity_id         int
    policy_id         int
    current_level     int default 1
    status            enum('pending','approved','rejected')
    submitted_by      int
    submitted_at      timestamp
    decided_by        int nullable
    decided_at        timestamp nullable
    rejection_reason  text nullable
    audit_hash        varchar(64)

  approval_request_levels
    id                int autoincrement PK
    request_id        int
    level_order       int
    approver_user_id  int
    status            enum('pending','approved','rejected','skipped')
    decided_at        timestamp nullable
    comment           text nullable
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | GET | `/api/approval-policies` | List all policies by module |
  | POST | `/api/approval-policies` | Create/configure policy |
  | PUT | `/api/approval-policies/:id` | Update policy |
  | GET | `/api/approvals/pending` | All pending approvals for current user |
  | POST | `/api/approvals/:request_id/approve` | Approve current level; advance or finalize |
  | POST | `/api/approvals/:request_id/reject` | Reject with reason |
  | POST | `/api/approvals/:request_id/final-approve` | Admin bypass: approve all remaining levels |

  Module-specific submit endpoints (`/api/bills/:id/submit`, `/api/purchase-orders/:id/submit`, etc.) create an `approval_requests` row and notify approvers.

- **Workflow / state machine:**

  ```
  entity.status: draft → submitted → (per level: pending → approved) → approved (entity unlocked)
                                                            ↘ rejected → draft
  multi-level: level 1 approved → level 2 pending → ... → all levels approved → entity approved
  ```

- **Automations:**
  - Email + in-app notification to approvers on submission.
  - Daily reminder email for approvals pending > 24 hours.
  - Escalation: if no action within configurable SLA (e.g., 48 hours), escalate to next-level approver or admin.
  - Webhook: `approval.submitted`, `approval.approved`, `approval.rejected`.

- **Personalized / better-than-Zoho:**
  - **Amount-based routing:** auto-select approver tier based on transaction amount (< $500: manager; < $5000: director; ≥ $5000: CFO) — configured as custom approval rule.
  - **Mobile-first approval UX:** each pending approval shows key fields (vendor, amount, due date) in a card; one-tap approve/reject with optional comment.
  - **SLA tracking:** show time-in-queue per pending approval; overdue highlighted in red.
  - **Audit ledger:** every approval action (submit, approve, reject, final-approve) chained immutably.

- **Build status:** New.

---

### PO → Bill → Payment 3-Way Matching

- **Purpose:** Automatically verify that a vendor's bill quantity and pricing matches what was ordered (PO) and what was actually received (goods receipt) before payment is released.

- **Zoho Books behaviour:**
  - Triggered when a bill is linked to a PO.
  - Compares: `bill_line.quantity` vs. `po_line.quantity` (2-way) and additionally vs. `sum(po_receive_lines.qty_received)` for that line (3-way).
  - Also compares: `bill_line.rate` vs. `po_line.rate`.
  - Discrepancies surfaced as a report on the bill detail page.
  - No hard block by default — user can override and proceed; configurable to require approval if discrepancy exists.

- **Data model:** Matching results are computed on demand from existing tables (`purchase_order_line_items`, `po_receive_lines`, `bill_line_items`). Optionally persist results for audit:

  ```
  bill_match_results
    id                    int autoincrement PK
    bill_id               int
    po_id                 int
    bill_line_id          int
    po_line_id            int
    billed_qty            decimal(15,4)
    ordered_qty           decimal(15,4)
    received_qty          decimal(15,4)
    billed_rate           decimal(15,4)
    po_rate               decimal(15,4)
    qty_variance_pct      decimal(7,2)
    rate_variance_pct     decimal(7,2)
    match_status          enum('matched','qty_variance','rate_variance','no_receive')
    computed_at           timestamp
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | GET | `/api/bills/:id/matching-report` | Run matching; return per-line comparison with variance %s |
  | POST | `/api/bills/:id/matching-report/override` | Record approver override with reason; required if variance > threshold |

- **Workflow / state machine:**

  ```
  bill.submit → auto-run match → if all matched: proceed to approval
                               → if variance > threshold: status = 'match_hold'; require override
  override recorded → proceed to approval
  ```

- **Automations:**
  - Auto-run on bill submit; re-run on line item edit.
  - Hard-block approval if `match_status = 'no_receive'` (goods never received) and org setting `require_receive_before_pay = true`.
  - Webhook: `bill.match_hold`, `bill.match_override`.

- **Personalized / better-than-Zoho:**
  - **Configurable variance thresholds** per item category (e.g., 0% for capex items, 5% for consumables).
  - **Match dashboard:** AP team sees all bills in `match_hold` state with side-by-side PO/receive/bill comparison.
  - **Historical price tolerance:** if billed rate is within ± 2% of average rate from last 6 POs for same item + vendor, auto-approve rate variance.
  - **Audit ledger:** every override recorded with approver + reason; fully immutable.

- **Build status:** New.

---

### Landed Costs

- **Purpose:** Allocate additional procurement charges (freight, customs, import duties, insurance) from a "landed cost" bill across the inventory items in one or more target bills, so the true per-unit cost is reflected in inventory valuation.

- **Zoho Books behaviour:**
  - Landed cost bill: a regular bill from a freight/customs vendor.
  - Allocation: user selects the landed cost bill and one or more target bills; chooses allocation method: **Quantity** (proportional to qty on each line), **Value** (proportional to line total), **Weight**, or **Dimensions**.
  - Result: each target bill line item's cost is incremented by its allocated share.
  - Requires inventory tracking to be enabled.
  - Can allocate one landed cost bill across multiple target bills simultaneously.
  - Inventory valuation (FIFO/Average) updated accordingly.

- **Data model:** (already defined in Bills section above: `bill_landed_costs`, `bill_landed_cost_lines`)

  Additional field on bill line items to track landed cost increment:

  ```
  bill_line_items
    ... (existing fields)
    landed_cost_adjustment decimal(15,2) default 0   -- total landed cost allocated to this line
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | POST | `/api/bills/:id/landed-costs` | Body: `{target_bill_ids[], allocation_method}`; runs allocation; mutate then select |
  | GET | `/api/bills/:id/landed-costs` | List landed cost allocations affecting or originating from this bill |
  | DELETE | `/api/bills/landed-costs/:lc_id` | Reverse allocation; recalculate line costs |

- **Workflow / state machine:**

  ```
  landed_cost_bill (status=open) → allocate → target bill lines updated
  reverse → line costs restored
  ```

  Allocation is only possible when the landed cost bill is `open` or `approved`.

- **Automations:**
  - On allocation, auto-update `item.average_cost` (or FIFO layer) for inventory items.
  - Webhook: `landed_cost.allocated`.

- **Personalized / better-than-Zoho:**
  - **Preview before commit:** show allocation table (each line, its share of landed cost) before saving — user can adjust.
  - **Multi-method comparison:** show side-by-side result of all four allocation methods so user can pick the most equitable.
  - **Audit ledger:** every allocation and reversal chained immutably.

- **Build status:** New.

---

### TDS / Withholding on Bills

- **Purpose:** Deduct Tax Deducted at Source (TDS) / withholding tax from vendor payments on applicable bills; track liability to tax authority; generate TDS certificates.

- **Zoho Books behaviour:**
  - TDS rates configured as a master list (section code, rate %, description) — e.g., Section 194C @ 1% for contractors.
  - Per bill line item: select applicable TDS section → system computes `tds_amount = rate × line_total`.
  - Net payable to vendor: `bill_total - total_tds_amount`.
  - TDS liability posted to a dedicated "TDS Payable" GL account.
  - Payment: vendor receives net amount; TDS remitted separately to tax authority.
  - TDS certificates (Form 16A / 16B) generated and downloadable.
  - TDS on vendor advances: supported.
  - Import/export TDS details with bills.
  - Quarterly TDS return data export.

- **Data model:**

  ```
  tds_rates
    id            int autoincrement PK
    org_id        int
    section_code  varchar(20)        -- '194C', '194J', etc.
    description   varchar(255)
    rate_percent  decimal(5,2)
    threshold_amount decimal(15,2)  -- annual threshold before TDS applies
    is_active     tinyint(1) default 1
    created_at    timestamp

  tds_entries
    id              int autoincrement PK
    org_id          int
    bill_id         int
    bill_line_id    int
    tds_rate_id     int
    tds_percent     decimal(5,2)
    base_amount     decimal(15,2)
    tds_amount      decimal(15,2)
    financial_year  varchar(10)      -- '2025-26'
    quarter         tinyint(1)       -- 1-4
    is_remitted     tinyint(1) default 0
    remittance_date date nullable
    created_at      timestamp
    audit_hash      varchar(64)
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | GET | `/api/tds/rates` | List active TDS rates |
  | POST | `/api/tds/rates` | Create new TDS rate |
  | PUT | `/api/tds/rates/:id` | Update TDS rate |
  | GET | `/api/bills/:id/tds` | TDS breakdown for a bill |
  | GET | `/api/tds/entries` | All TDS entries; filters: `financial_year`, `quarter`, `vendor_id`, `is_remitted` |
  | POST | `/api/tds/entries/:id/mark-remitted` | Mark TDS as remitted to authority |
  | GET | `/api/tds/certificate/:bill_id` | Generate TDS certificate PDF |
  | GET | `/api/tds/return-data` | Export quarterly TDS return data (CSV) |

- **Workflow / state machine:**

  ```
  bill approved → tds_entries created (one per TDS line item)
  payment to vendor: net = total - tds_total
  tds_entries.is_remitted = false → remit to authority → mark remitted
  ```

- **Automations:**
  - On bill approval, auto-create `tds_entries` rows for all lines with `tds_id` set.
  - Quarterly reminder: 15 days before quarter-end, email AP team list of un-remitted TDS entries.
  - Annual threshold check: track cumulative payments per vendor per section; flag when annual threshold is crossed and TDS becomes applicable.
  - Webhook: `tds.entry_created`, `tds.remitted`.

- **Personalized / better-than-Zoho:**
  - **Threshold auto-monitor:** system auto-enables TDS on a vendor line once cumulative annual payments cross the configured section threshold — no manual tracking.
  - **One-click return package:** generate a zip with all TDS certificates + return CSV for the selected quarter.
  - **GL preview:** before approving a bill with TDS, show the projected journal (Dr: Expense, Cr: Vendor Payable net, Cr: TDS Payable) for review.
  - **Audit ledger:** every TDS entry and remittance chained immutably.

- **Build status:** New.

---

## Summary Table

| Feature | Zoho Parity | Personalized Additions | Build Status |
|---------|-------------|------------------------|--------------|
| Vendors | Full | Duplicate detection, risk score, audit ledger | Partial |
| Expenses | Full | Smart OCR + confidence, duplicate receipt detection, anomaly alert, Google Maps mileage | Partial |
| Recurring Expenses | Full | Smart pause, cost drift alert, audit ledger | Partial |
| Purchase Orders | Full | Delivery variance alert, price drift detection, auto-convert prompt | Partial |
| Bills | Full | Auto 3-way match block, GL preview, anomaly detection, portal OCR intake | Partial |
| Recurring Bills | Full | Smart stop, amount-change alert, audit ledger | Partial |
| Payments Made | Full | Batch payment queue, bank feed matching, duplicate payment detection | Partial |
| Vendor Credits | Full | Auto-suggest on bill, credit aging alert, audit ledger | Partial |
| Vendor / Supplier Portal | Full | 2FA, real-time status tracker, smart OCR display, W-9 expiry tracking | New |
| Purchase Approval Workflows | Full | Amount-based routing, SLA tracking, mobile-first UX | New |
| PO → Bill → Payment 3-Way Matching | Full | Configurable thresholds per category, historical price tolerance | New |
| Landed Costs | Full | Preview before commit, multi-method comparison | New |
| TDS / Withholding on Bills | Full | Threshold auto-monitor, one-click return package, GL preview | New |
