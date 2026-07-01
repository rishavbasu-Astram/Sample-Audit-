# Zoho Books → Astram Financial Portal: Feature Blueprint

> **Purpose.** An implementation-ready specification of Zoho Books' full feature set,
> mapped onto the Astram Financial Portal's stack — so it can be fed to Claude Code to
> build a system that **replicates Zoho Books but is better and more personalized**.
> Every feature includes its data model, contract-first API, workflow/state machine,
> automations, and concrete "better-than-Zoho" enhancements.

---

## How to use this document (with Claude Code)

- This is a **blueprint, not a mandate** — each feature is a self-contained unit of work.
  Hand Claude Code one module (or one `###` feature) at a time; they're written to be
  built independently in the dependency order below.
- Every feature follows the same template: **Purpose · Zoho behaviour · Data model ·
  API · Workflow/state machine · Automations · Personalized/better · Build status.**
- **Build status** tells you what already exists in the repo (basic CRUD) vs. what's new:
  - `Built` — exists, may need depth added.  `Partial` — some of it exists.  `New` — greenfield.
- Follow the **architecture conventions** below for everything, so generated code matches
  the existing contract-first monorepo and stays consistent.

### Suggested build order (dependency-aware)
1. **Platform engines first** (§8): event bus, scheduler/recurring runner, rule engine,
   notification service, webhook dispatcher, RBAC, custom fields. *Almost every other
   feature's "Automations" depends on these.*
2. **Items & Inventory** (§5) — line items feed Sales/Purchases; COGS feeds the GL.
3. **Taxes** (§6) — the pluggable tax engine is consumed by every transaction.
4. **Sales/AR** (§1) & **Purchases/AP** (§2) depth on top of existing CRUD.
5. **Banking** (§3) matching/reconciliation, then **Accountant/GL** (§4) posting + close.
6. **Reports & Dashboard** (§7) last — it reads everything above.

---

## Target architecture & conventions

The portal is a **contract-first pnpm monorepo**. Build every feature the same way:

**Contract-first pipeline (the golden path).**
1. Model data in `lib/db/src/schema/<module>.ts` (Drizzle, MariaDB/MySQL).
2. Define the contract in `lib/api-spec/openapi.yaml` (the single source of truth).
3. `pnpm --filter @workspace/api-spec run codegen` → regenerates TanStack Query hooks
   (`lib/api-client-react`) and Zod schemas (`lib/api-zod`).
4. Implement the Express handler in `artifacts/api-server/src/routes/<module>.ts`.
5. Build the page in `artifacts/financial-portal/src/pages/<module>/`, wire into `App.tsx`
   (wouter `<Route>`) and the sidebar, consuming the generated hooks.

**Database (MariaDB / MySQL via Drizzle `mysql2`) — non-negotiable rules.**
- PKs: `int("id").autoincrement().primaryKey()`. Money: `decimal(15,2)`. Rates: `decimal(15,6)`.
- JSON arrays/objects (line items, entries, config): use the **custom `json` type** in
  `lib/db/src/json.ts` (MariaDB stores JSON as `LONGTEXT`, so it must parse/serialize explicitly).
- Timestamps: `timestamp("created_at").notNull().defaultNow()`.
- **MySQL has no `RETURNING`** — every create/update/delete is **mutate-then-select**:
  `insert().$returningId()` then `select().where(eq(id, insertedId))`; update/delete → mutate, then select.
- No FK constraints today (plain `int` id columns) — enforce integrity in the app layer.
- Numeric/decimal columns arrive as **strings** from the driver → `parseFloat()` before serializing.

**API conventions.**
- Everything is under `/api`. REST, resource-oriented, tagged per module in the OpenAPI spec.
- List endpoints take filters/pagination params; document-number generation (`INV-`, `BILL-`,
  `QT-`, `PO-`, …) happens server-side at insert.
- Validate request bodies with the generated Zod schemas; refine business rules (e.g. journal
  debits == credits) in Zod + a DB-level check where possible.

**Security & compliance backbone — lean on it.**
- A **tamper-evident, hash-chained audit ledger** already records every mutating request
  (`docs/SECURITY_LEDGER.md`; `/api/audit`, `/api/audit/verify`). Treat it as the compliance
  spine: financial filings, period closes, approvals, and GL postings should be anchored to it.
  This is a genuine differentiator over Zoho — surface it everywhere.

**Personalization philosophy ("better than Zoho").**
Each feature lists specific ideas, but the recurring themes are: **AI assist** (draft documents,
classify HSN/SAC & expenses, natural-language reports, anomaly detection), **deeper automation**
(a real workflow-rule engine + reliable recurring runner), **everything API-first &
queryable** (Zoho locks some reports/exports behind the UI — expose them), **tamper-evidence
by default** (the audit ledger), and a **cleaner, information-dense UX** ("Bloomberg meets
modern SaaS").

---

## Master feature index

| # | Module | Coverage |
|---|--------|----------|
| 1 | **Sales / Accounts Receivable** | Customers, Estimates/Quotes, Retainer Invoices, Sales Orders, Delivery Challans, Invoices, Recurring Invoices, Payments Received, Credit Notes, Sales Receipts, Payment Links, Customer Portal, sales tax, PDF/email |
| 2 | **Purchases / Accounts Payable** | Vendors, Expenses (+OCR/mileage), Recurring Expenses, Purchase Orders, Bills, Recurring Bills, Payments Made, Vendor Credits, Vendor Portal, approvals, 3-way matching, landed costs, TDS |
| 3 | **Banking & Reconciliation** | Accounts, live feeds, statement import, categorization, bank rules, matching, reconciliation, transfers, undeposited funds, multi-currency, cash/petty cash |
| 4 | **Accountant / General Ledger** | Chart of Accounts, Manual & Recurring Journals, Opening Balances, Budgets, FX adjustments, Transaction Locking/period close, GL drill-down, bulk ops, accountant roles |
| 5 | **Items, Inventory & Price Lists** | Items, groups/variants, composite/bundle items, inventory tracking, stock adjustments, valuation & COGS, price lists, warehouses, inventory reports |
| 6 | **Taxes & Compliance** | Tax rates/groups, authorities, GST (India), VAT (UK/EU/GCC), US sales tax, TDS/TCS, digital tax, exemptions, multi-tax, returns/filing, tax payments |
| 7 | **Reports & Dashboard** | Dashboard/KPIs, financial statements, AR/AP reports, sales/purchase reports, tax & inventory reports, budgets vs actuals, ratios, custom builder, scheduling, export |
| 8 | **Platform: Automation, Workflows, Integrations & Admin** | Workflow rules, custom functions, recurring/scheduler engine, notifications, webhooks, developer API, approvals, users/roles/RBAC, orgs/multi-branch, custom fields/views/tags, documents/OCR, client & vendor portals, projects/timesheets, audit trail, integrations |

> **Shared engines (build once, in §8, used everywhere):** event bus · scheduler + recurring
> runner · workflow-rule engine · notification service (email/SMS) · webhook dispatcher ·
> RBAC · custom-fields · document store/OCR. Many "Automations" bullets across §1–§7 assume
> these exist.

---

<!-- The module sections below are assembled from docs/zoho-blueprint/*.md -->


---

## 1. Sales / Accounts Receivable

The Sales / AR module is the revenue core of the portal. It covers every document in the customer-facing money flow — from the first estimate through fulfilment, invoicing, tax calculation, payment collection, and credit management — and surfaces them to customers through a self-service portal. All write paths must go through the audit ledger, and the OpenAPI spec in `lib/api-spec/openapi.yaml` is the single source of truth; Orval regenerates TanStack Query hooks and Zod schemas on every spec change.

**Sub-features covered:**
- Customers (contacts, contact persons, sub-customers/hierarchy, portal access, statements, credit limits)
- Estimates / Quotes
- Retainer Invoices
- Sales Orders
- Delivery Challans / Notes
- Invoices
- Recurring Invoices
- Payments Received
- Credit Notes
- Sales Receipts (one-shot payment-at-point-of-sale)
- Payment Links / Gateways
- Customer Portal
- Sales Tax on Documents
- PDF Templates & Email

---

### Customers (Contacts)

- **Purpose:** Master record for every entity that buys from the organisation; drives address defaulting, tax treatment, credit control, and portal access across all AR documents.

- **Zoho Books behaviour:**
  - Contact type: `customer` | `vendor` | `both`. Sub-type: `individual` | `business`.
  - Multiple **contact persons** per contact (primary flag, email, phone, portal access toggle, SMS toggle).
  - **Customer hierarchy** — up to 5 levels of parent → sub-customer. Parent can view/pay sub-customer invoices via portal; consolidated statements span the tree.
  - **Credit limit** — set in base currency; enforcement mode = `restrict` (block invoice create/update) or `warn`. Sales-order amounts optionally counted in balance. Recurring invoices still fire but trigger email notification when limit breached.
  - **Portal** — per contact-person email invitation; portal URL configurable. Customers view quotes, invoices, SO, retainers, statements; accept/decline quotes; pay outstanding invoices (bulk); manage saved cards.
  - **Customer statements** — date-range; include sub-customers toggle; emailed as PDF.
  - **Opening balance** — carry-forward AR balance.
  - Tax classification: `is_taxable`, `tax_id`, exemption reason per tax authority.
  - Payment terms (Net 15/30/60/custom), preferred currency, preferred payment gateway per contact.

- **Data model:**

  ```
  customers                      (existing basic CRUD — extend)
    id                 int auto_increment PK
    display_name       text not null
    company_name       text
    customer_type      text          -- 'individual' | 'business'
    parent_customer_id int           -- self-ref (no FK constraint)
    credit_limit       decimal(15,2) default 0
    credit_limit_mode  text          -- 'restrict' | 'warn' | 'none'
    payment_terms      int           -- days; 0 = due on receipt
    payment_terms_label text
    currency_code      text default 'INR'
    is_taxable         tinyint(1) default 1
    tax_id             int           -- ref taxes.id
    tax_exemption_id   int           -- ref tax_exemptions.id
    portal_enabled     tinyint(1) default 0
    opening_balance    decimal(15,2) default 0
    billing_address    json          -- {line1,line2,city,state,zip,country}
    shipping_address   json
    notes              text
    custom_fields      json
    created_at         timestamp default current_timestamp
    updated_at         timestamp default current_timestamp on update current_timestamp

  customer_contact_persons
    id                 int auto_increment PK
    customer_id        int not null
    first_name         text
    last_name          text
    email              text
    phone              text
    is_primary         tinyint(1) default 0
    portal_access      tinyint(1) default 0
    created_at         timestamp default current_timestamp
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | GET | `/api/customers` | filters: `contact_type`, `search`, `page`, `limit`, `has_credit_limit` |
  | POST | `/api/customers` | mutate then select |
  | GET | `/api/customers/:id` | includes contact_persons, balance, credit_used |
  | PUT | `/api/customers/:id` | mutate then select |
  | DELETE | `/api/customers/:id` | soft-delete recommended |
  | GET | `/api/customers/:id/statement` | query: `from_date`, `to_date`, `include_sub_customers` |
  | POST | `/api/customers/:id/portal-invite` | send portal invitation email |
  | GET | `/api/customers/:id/balance` | outstanding balance + credit_limit + available_credit |
  | POST | `/api/customers/:id/contact-persons` | add contact person |
  | PUT | `/api/customers/:id/contact-persons/:cpId` | |
  | DELETE | `/api/customers/:id/contact-persons/:cpId` | |

  Response for `GET /customers/:id` must include computed `credit_used` (sum of unpaid invoices + open SOs if mode includes SOs) and `credit_available`.

- **Workflow / state machine:**
  Customers are not stateful documents. Credit limit enforcement fires on `POST /invoices` and `PUT /invoices/:id`: if `credit_used + new_invoice_total > credit_limit` and mode = `restrict`, return 422 with `error: credit_limit_exceeded`.

- **Automations:**
  - Auto-number not applicable (display_name is the key).
  - Statement email job: schedulable via cron or on-demand.
  - On credit-limit breach in a recurring invoice child generation: emit notification record + email.

- **Personalized / better-than-Zoho:**
  - AI-assisted contact enrichment: given a company name, suggest website, address, tax ID via web lookup.
  - Risk score badge on customer card: days-sales-outstanding trend + payment history → Low / Medium / High.
  - Audit ledger shows every field change on the customer record with diff (Zoho does not expose full field history to users).
  - Bulk CSV import with dedup detection (match on email or company_name) rather than silent duplicates.

- **Build status:** Partial (basic CRUD exists; contact persons, hierarchy, credit limits, portal invites, statements are New).

---

### Estimates / Quotes

- **Purpose:** Pre-sale price proposal sent to the customer for acceptance or negotiation before any commitment is recorded.

- **Zoho Books behaviour:**
  - Statuses: `draft` → `sent` → `accepted` | `declined` | `expired`. Also `invoiced` (after conversion).
  - Expiry date: estimate becomes `expired` automatically if not actioned by expiry date.
  - Customer can accept/decline from the public estimate link or customer portal; can leave a comment when declining.
  - Optional approval workflow before sending (submit → approved → sent).
  - Convert to: Invoice, Sales Order, Retainer Invoice (one-click, inherits all line items, taxes, addresses).
  - Discounts: per-line-item percentage or flat, or document-level percentage/flat, or both.
  - Multi-currency with exchange-rate capture at creation time.
  - Bulk operations: email, export PDF, mark sent.
  - Custom fields on header and line items.

- **Data model:**

  ```
  quotes                        (rename from 'estimates' if needed for clarity)
    id                int auto_increment PK
    quote_number      text not null unique
    customer_id       int not null
    status            text default 'draft'
      -- 'draft'|'sent'|'accepted'|'declined'|'expired'|'invoiced'
    expiry_date       text          -- DATE as text yyyy-mm-dd
    date              text not null -- DATE
    reference_number  text
    currency_code     text default 'INR'
    exchange_rate     decimal(15,6) default 1
    discount_type     text          -- 'percentage'|'flat'|'none'
    discount_value    decimal(15,2) default 0
    subtotal          decimal(15,2) not null default 0
    discount_total    decimal(15,2) default 0
    tax_total         decimal(15,2) default 0
    total             decimal(15,2) not null default 0
    notes             text
    terms             text
    template_id       int
    approved_by       int           -- user_id
    approved_at       timestamp null
    custom_fields     json
    created_by        int
    created_at        timestamp default current_timestamp
    updated_at        timestamp default current_timestamp on update current_timestamp

  quote_line_items
    id                int auto_increment PK
    quote_id          int not null
    item_id           int
    description       text
    quantity          decimal(15,4) default 1
    unit              text
    rate              decimal(15,4) not null
    discount_type     text          -- 'percentage'|'flat'|'none'
    discount_value    decimal(15,2) default 0
    tax_id            int
    tax_percentage    decimal(6,3) default 0
    line_total        decimal(15,2) not null
    sort_order        int default 0
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | GET | `/api/quotes` | filters: `status`, `customer_id`, `from_date`, `to_date`, `search`, `page`, `limit` |
  | POST | `/api/quotes` | auto-number; compute subtotal/tax/total server-side; mutate then select |
  | GET | `/api/quotes/:id` | include line_items, customer snapshot |
  | PUT | `/api/quotes/:id` | recompute totals; mutate then select |
  | DELETE | `/api/quotes/:id` | only draft/declined allowed |
  | POST | `/api/quotes/:id/send` | set status → sent; generate PDF; queue email |
  | POST | `/api/quotes/:id/mark-accepted` | status → accepted |
  | POST | `/api/quotes/:id/mark-declined` | body: `{reason}` |
  | POST | `/api/quotes/:id/submit-approval` | status → pending_approval |
  | POST | `/api/quotes/:id/approve` | status → approved |
  | POST | `/api/quotes/:id/convert` | body: `{target: 'invoice'|'sales_order'|'retainer'}` → returns new document id |
  | GET | `/api/quotes/:id/pdf` | render PDF via template |
  | GET | `/api/quotes/:id/email-content` | preview email before send |
  | POST | `/api/quotes/bulk-email` | body: `{ids[]}` |

  Public (unauthenticated) endpoint:
  | GET | `/api/pub/quotes/:token` | customer-facing view via share token |
  | POST | `/api/pub/quotes/:token/accept` | customer accepts |
  | POST | `/api/pub/quotes/:token/decline` | body: `{comment}` |

- **Workflow / state machine:**

  ```
  draft ──send──► sent ──accept──► accepted ──convert──► invoiced
                       └─decline─► declined
                       └─expire──► expired   (scheduler daily check)
  draft ──submit──► pending_approval ──approve──► draft (then send)
  ```

- **Automations:**
  - Auto-number: `QT-{YYYY}-{seq:5}`, seq resets annually or runs globally (configurable).
  - Totals recalculated server-side on every save (never trust client totals).
  - Expiry scheduler: daily cron sets `status = 'expired'` where `expiry_date < today AND status = 'sent'`.
  - Auto-reminder: configurable reminder N days before expiry (email).
  - Audit ledger write on every status transition.

- **Personalized / better-than-Zoho:**
  - AI quote drafting: given customer name + a plain-text description of work, suggest line items with rates from the item catalogue.
  - Win/loss analytics: track decline reasons; surface conversion-rate dashboard by sales rep.
  - Inline negotiation thread: customer comments attached to the quote timeline (not just a generic email thread).
  - Smart expiry suggestion: ML-derived "typical acceptance window" per customer segment shown when setting expiry.

- **Build status:** Partial (CRUD exists; status transitions, public token link, convert, approval, expiry scheduler, PDF/email are New).

---

### Retainer Invoices

- **Purpose:** Collect advance/deposit payments from customers before goods are delivered or services rendered; amount is a liability until applied against a real invoice.

- **Zoho Books behaviour:**
  - Statuses: `draft` | `sent` | `overdue` | `paid` | `partially_paid` | `void`.
  - Created standalone or from a Sales Order or Project.
  - Customer pays via portal/email link or is charged automatically (if payment gateway on file).
  - "Apply Retainer to Invoice" — draws down the retainer balance against one or more invoices; creates a journal entry recognising revenue.
  - Unused retainer balance can be refunded.
  - Approval workflow: submit → approve → sent.
  - PDF template separate from regular invoice template.
  - `payment_made` tracks collected; `payment_drawn` tracks applied; `balance = payment_made - payment_drawn`.

- **Data model:**

  ```
  retainer_invoices
    id                    int auto_increment PK
    retainer_number       text not null unique
    customer_id           int not null
    status                text default 'draft'
    date                  text not null
    due_date              text
    currency_code         text
    exchange_rate         decimal(15,6) default 1
    line_items            json          -- [{description, rate, tax_id, tax_pct, amount}]
    subtotal              decimal(15,2) default 0
    tax_total             decimal(15,2) default 0
    total                 decimal(15,2) default 0
    payment_made          decimal(15,2) default 0
    payment_drawn         decimal(15,2) default 0
    balance               decimal(15,2) default 0   -- computed: total - payment_made
    notes                 text
    template_id           int
    custom_fields         json
    created_by            int
    created_at            timestamp default current_timestamp
    updated_at            timestamp default current_timestamp on update current_timestamp

  retainer_applications          -- links retainer → invoice
    id                    int auto_increment PK
    retainer_invoice_id   int not null
    invoice_id            int not null
    amount_applied        decimal(15,2) not null
    applied_at            timestamp default current_timestamp
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | GET | `/api/retainer-invoices` | filters: `status`, `customer_id`, `from_date`, `to_date` |
  | POST | `/api/retainer-invoices` | auto-number; mutate then select |
  | GET | `/api/retainer-invoices/:id` | include applications |
  | PUT | `/api/retainer-invoices/:id` | |
  | DELETE | `/api/retainer-invoices/:id` | draft only |
  | POST | `/api/retainer-invoices/:id/send` | status → sent |
  | POST | `/api/retainer-invoices/:id/void` | |
  | POST | `/api/retainer-invoices/:id/apply` | body: `{invoice_id, amount}` → inserts retainer_application, updates balances |
  | POST | `/api/retainer-invoices/:id/refund` | body: `{amount, payment_mode, date}` |
  | GET | `/api/retainer-invoices/:id/pdf` | |

- **Workflow / state machine:**

  ```
  draft ──send──► sent ──payment recorded──► partially_paid ──full payment──► paid
                                                                └─apply to invoice──► (balance reduces)
                                        └──overdue (scheduler)──►
  any ──void──► void
  paid retainer with balance ──refund──► balance = 0
  ```

- **Automations:**
  - Auto-number: `RI-{YYYY}-{seq:5}`.
  - Overdue scheduler: daily, same as invoices.
  - Audit ledger on apply, refund, void.

- **Personalized / better-than-Zoho:**
  - Visual retainer balance widget on invoice creation screen: "You have ₹X in unapplied retainers for this customer — apply now?"
  - Retainer utilisation report: how long retainers sit unapplied per customer.

- **Build status:** New.

---

### Sales Orders

- **Purpose:** Binding commitment document issued after an estimate is accepted (or directly); precedes fulfilment and invoicing.

- **Zoho Books behaviour:**
  - Statuses: `draft` | `open` | `void`. Sub-statuses for fulfilment: `not_invoiced` | `partially_invoiced` | `invoiced`.
  - Created from estimate or from scratch.
  - Approval workflow: submit → approve.
  - Convert to: Invoice (full or partial), Delivery Challan.
  - Multiple invoices can be generated from one SO (partial invoicing). SO sub-status tracks progress.
  - SO amount optionally included in customer credit limit calculation.
  - Addresses, line items, taxes identical shape to invoices/estimates.
  - Shipment details: expected shipment date, shipping method.

- **Data model:**

  ```
  sales_orders
    id                    int auto_increment PK
    so_number             text not null unique
    customer_id           int not null
    quote_id              int           -- source estimate if converted
    status                text default 'draft'   -- 'draft'|'open'|'void'
    fulfillment_status    text default 'not_invoiced'
      -- 'not_invoiced'|'partially_invoiced'|'invoiced'
    date                  text not null
    shipment_date         text
    shipping_method       text
    reference_number      text
    currency_code         text
    exchange_rate         decimal(15,6) default 1
    discount_type         text
    discount_value        decimal(15,2) default 0
    subtotal              decimal(15,2) default 0
    discount_total        decimal(15,2) default 0
    tax_total             decimal(15,2) default 0
    total                 decimal(15,2) default 0
    invoiced_amount       decimal(15,2) default 0
    billing_address       json
    shipping_address      json
    notes                 text
    terms                 text
    template_id           int
    approved_by           int
    approved_at           timestamp null
    custom_fields         json
    created_by            int
    created_at            timestamp default current_timestamp
    updated_at            timestamp default current_timestamp on update current_timestamp

  sales_order_line_items
    id             int auto_increment PK
    so_id          int not null
    item_id        int
    description    text
    quantity       decimal(15,4)
    unit           text
    rate           decimal(15,4)
    discount_type  text
    discount_value decimal(15,2) default 0
    tax_id         int
    tax_percentage decimal(6,3) default 0
    invoiced_qty   decimal(15,4) default 0
    line_total     decimal(15,2)
    sort_order     int default 0
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | GET | `/api/sales-orders` | filters: `status`, `fulfillment_status`, `customer_id`, `from_date`, `to_date` |
  | POST | `/api/sales-orders` | auto-number; mutate then select |
  | GET | `/api/sales-orders/:id` | include line items, linked invoices, challans |
  | PUT | `/api/sales-orders/:id` | |
  | DELETE | `/api/sales-orders/:id` | draft only |
  | POST | `/api/sales-orders/:id/mark-open` | |
  | POST | `/api/sales-orders/:id/void` | |
  | POST | `/api/sales-orders/:id/submit-approval` | |
  | POST | `/api/sales-orders/:id/approve` | |
  | POST | `/api/sales-orders/:id/convert-to-invoice` | body: `{line_items: [{so_line_id, quantity}]}` |
  | POST | `/api/sales-orders/:id/convert-to-challan` | |
  | GET | `/api/sales-orders/:id/pdf` | |
  | POST | `/api/sales-orders/:id/send` | |

- **Workflow / state machine:**

  ```
  draft ──submit──► pending_approval ──approve──► draft
  draft ──mark-open──► open
  open  ──partial invoice created──► fulfillment_status: partially_invoiced
  open  ──all qty invoiced──► fulfillment_status: invoiced
  open/draft ──void──► void
  ```

- **Automations:**
  - Auto-number: `SO-{YYYY}-{seq:5}`.
  - Credit limit check on `POST /sales-orders` if org setting includes SO in limit.
  - Audit ledger on each status and fulfilment_status change.

- **Personalized / better-than-Zoho:**
  - Fulfilment progress bar per SO in the list view (% of qty invoiced).
  - Backorder alerts: flag SO line items where stock is insufficient (if inventory module is integrated).
  - Automated "shipment due soon" notification to internal user N days before `shipment_date`.

- **Build status:** Partial (CRUD exists; approval, convert-to-invoice/challan, credit check, fulfillment tracking are New).

---

### Delivery Challans / Notes

- **Purpose:** Accompanies physical shipment of goods; not a tax document — records what was dispatched and when, then converts to an invoice after confirmed delivery.

- **Zoho Books behaviour:**
  - Statuses: `draft` → `open` → `delivered` | `returned` | `partially_invoiced` | `invoiced`.
  - Created from Sales Order or standalone.
  - `Convert to Open` after goods dispatched.
  - `Mark as Delivered` after customer receives goods.
  - `Mark as Returned` if goods come back.
  - Partial delivery possible: only delivered items get invoiced; challan status → `partially_invoiced`.
  - Can convert to Invoice for delivered line items only.
  - Challan type: `sales` | `sales_return` | `job_work` | `others`.
  - Custom fields; PDF template separate from invoice template.
  - Preferences: auto-number prefix, whether to show rates/amounts on challan PDF (some businesses omit pricing).

- **Data model:**

  ```
  delivery_challans
    id                int auto_increment PK
    challan_number    text not null unique
    so_id             int           -- source SO if converted
    customer_id       int not null
    status            text default 'draft'
      -- 'draft'|'open'|'delivered'|'returned'|'partially_invoiced'|'invoiced'
    challan_type      text default 'sales'
      -- 'sales'|'sales_return'|'job_work'|'others'
    date              text not null
    reference_number  text
    show_pricing      tinyint(1) default 1
    notes             text
    terms             text
    template_id       int
    custom_fields     json
    created_by        int
    created_at        timestamp default current_timestamp
    updated_at        timestamp default current_timestamp on update current_timestamp

  delivery_challan_line_items
    id                int auto_increment PK
    challan_id        int not null
    so_line_id        int           -- source SO line
    item_id           int
    description       text
    quantity          decimal(15,4)
    unit              text
    rate              decimal(15,4)
    delivered_qty     decimal(15,4) default 0
    returned_qty      decimal(15,4) default 0
    invoiced_qty      decimal(15,4) default 0
    sort_order        int default 0
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | GET | `/api/delivery-challans` | filters: `status`, `customer_id`, `from_date`, `to_date` |
  | POST | `/api/delivery-challans` | auto-number; mutate then select |
  | GET | `/api/delivery-challans/:id` | include line items |
  | PUT | `/api/delivery-challans/:id` | |
  | DELETE | `/api/delivery-challans/:id` | draft only |
  | POST | `/api/delivery-challans/:id/mark-open` | status → open |
  | POST | `/api/delivery-challans/:id/mark-delivered` | status → delivered |
  | POST | `/api/delivery-challans/:id/mark-returned` | partial or full return; body: `{line_items: [{id, returned_qty}]}` |
  | POST | `/api/delivery-challans/:id/convert-to-invoice` | body: `{line_items: [{id, quantity}]}` |
  | GET | `/api/delivery-challans/:id/pdf` | |

- **Workflow / state machine:**

  ```
  draft ──mark-open──► open
  open  ──mark-delivered──► delivered
  delivered ──convert-to-invoice (all)──► invoiced
  delivered ──convert-to-invoice (partial)──► partially_invoiced
  open/delivered ──mark-returned──► returned
  ```

- **Automations:**
  - Auto-number: `DC-{YYYY}-{seq:5}`.
  - Audit ledger on every status change.

- **Personalized / better-than-Zoho:**
  - QR code on challan PDF that the delivery agent scans on arrival to mark as delivered via mobile-friendly endpoint.
  - Real-time delivery status pushed to customer portal: "Your goods are in transit / Delivered."

- **Build status:** New.

---

### Invoices

- **Purpose:** The primary revenue document demanding payment from a customer for goods or services delivered.

- **Zoho Books behaviour:**
  - Statuses: `draft` | `sent` | `overdue` | `paid` | `partially_paid` | `void`.
  - Created from: scratch, Quote, Sales Order, Delivery Challan, Retainer Invoice, Recurring Invoice profile.
  - Approval workflow: submit → approve before sending.
  - Payment recording: partial or full; split payment across modes; excess payment stays as customer credit.
  - Late fees: configurable flat or % fee added after due date.
  - Credit application: apply credit notes or retainer credits against unpaid balance.
  - Write-off: small balances written off to a bad-debt account.
  - ACH / card online payment via gateway; "Pay Now" button in email + portal.
  - Digital signatures, QR code on PDF.
  - E-invoicing: IRN generation for India GST (Zoho-specific; plan for extensibility).
  - Dunning notifications: up to 30 automated reminders (before/after due date).
  - Clone, void, delete (only draft).
  - Journal entry view.
  - Bulk: email, void, mark sent, export.

- **Data model:**

  ```
  invoices
    id                  int auto_increment PK
    invoice_number      text not null unique
    customer_id         int not null
    so_id               int
    quote_id            int
    recurring_invoice_id int
    challan_id          int
    status              text default 'draft'
      -- 'draft'|'sent'|'overdue'|'paid'|'partially_paid'|'void'
    date                text not null
    due_date            text
    payment_terms       int
    reference_number    text
    currency_code       text
    exchange_rate       decimal(15,6) default 1
    discount_type       text
    discount_value      decimal(15,2) default 0
    shipping_charge     decimal(15,2) default 0
    adjustment          decimal(15,2) default 0
    adjustment_label    text
    subtotal            decimal(15,2) default 0
    discount_total      decimal(15,2) default 0
    tax_total           decimal(15,2) default 0
    total               decimal(15,2) default 0
    amount_due          decimal(15,2) default 0
    amount_paid         decimal(15,2) default 0
    credits_applied     decimal(15,2) default 0
    late_fee_amount     decimal(15,2) default 0
    billing_address     json
    shipping_address    json
    notes               text
    terms               text
    template_id         int
    approved_by         int
    approved_at         timestamp null
    sent_at             timestamp null
    custom_fields       json
    created_by          int
    created_at          timestamp default current_timestamp
    updated_at          timestamp default current_timestamp on update current_timestamp

  invoice_line_items
    id             int auto_increment PK
    invoice_id     int not null
    item_id        int
    description    text
    quantity       decimal(15,4)
    unit           text
    rate           decimal(15,4)
    discount_type  text
    discount_value decimal(15,2) default 0
    tax_id         int
    tax_percentage decimal(6,3) default 0
    line_total     decimal(15,2)
    sort_order     int default 0

  invoice_taxes                  -- exploded tax rows for reporting
    id             int auto_increment PK
    invoice_id     int not null
    tax_id         int not null
    tax_name       text
    tax_percentage decimal(6,3)
    taxable_amount decimal(15,2)
    tax_amount     decimal(15,2)
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | GET | `/api/invoices` | filters: `status`, `customer_id`, `from_date`, `to_date`, `overdue`, `search`, `page`, `limit` |
  | POST | `/api/invoices` | auto-number; compute totals; check credit limit; mutate then select |
  | GET | `/api/invoices/:id` | include line_items, taxes, payments, credits_applied |
  | PUT | `/api/invoices/:id` | recompute totals; mutate then select |
  | DELETE | `/api/invoices/:id` | draft only |
  | POST | `/api/invoices/:id/send` | status → sent; queue email+PDF; record sent_at |
  | POST | `/api/invoices/:id/void` | |
  | POST | `/api/invoices/:id/submit-approval` | |
  | POST | `/api/invoices/:id/approve` | |
  | POST | `/api/invoices/:id/record-payment` | body: `{amount, payment_mode, date, reference, invoice_payments[]}` |
  | POST | `/api/invoices/:id/apply-credits` | body: `{credits: [{source_type, source_id, amount}]}` |
  | POST | `/api/invoices/:id/write-off` | body: `{amount, account_id}` |
  | POST | `/api/invoices/:id/late-fee` | add late fee line |
  | POST | `/api/invoices/:id/send-reminder` | manual reminder email |
  | GET | `/api/invoices/:id/pdf` | |
  | GET | `/api/invoices/:id/payment-link` | returns shareable URL |
  | POST | `/api/invoices/bulk-email` | `{ids[]}` |
  | POST | `/api/invoices/bulk-void` | `{ids[]}` |

  Public endpoint:
  | GET | `/api/pub/invoices/:token` | unauthenticated; returns invoice for payment |
  | POST | `/api/pub/invoices/:token/pay` | trigger gateway charge |

- **Workflow / state machine:**

  ```
  draft ──send──► sent ──payment (partial)──► partially_paid ──full payment──► paid
                      └──overdue (scheduler)──► overdue ──payment──► partially_paid / paid
                      └──apply credits──► (amount_due reduces)
  any (not paid/void) ──void──► void
  draft ──submit──► pending_approval ──approve──► draft
  ```

- **Automations:**
  - Auto-number: `INV-{YYYY}-{seq:5}`.
  - Overdue scheduler: daily cron sets `status = 'overdue'` where `due_date < today AND status IN ('sent', 'partially_paid')`.
  - Payment reminder scheduler: configurable rules (before/after due date, N days, email template); up to 30 rules per org; cron evaluates daily, inserts `reminder_log` records to prevent duplicate sends.
  - Late fee job: if enabled, adds late fee after grace period; runs nightly.
  - On payment: if `amount_due = 0`, set `status = 'paid'`; else `partially_paid`.

- **Personalized / better-than-Zoho:**
  - AI payment prediction: based on customer history, show "Likely to pay in N days" on invoice row.
  - Smart reminder tone selection: first reminder = friendly; third reminder = firm; configurable.
  - Audit ledger on every status change, payment record, credit application — full tamper-evident trail (unique differentiator vs. Zoho's soft log).
  - One-click "send and track" — records email open and link-click events via tracking pixel/redirect (Zoho does not expose click tracking natively in Books).
  - Bulk late-fee preview before applying.

- **Build status:** Partial (CRUD exists; approval, reminders, write-off, late fee, credit application, PDF/email, public payment token are New).

---

### Recurring Invoices

- **Purpose:** Invoice profile that auto-generates child invoices on a schedule for subscriptions, retainers, or ongoing services.

- **Zoho Books behaviour:**
  - Profile statuses: `active` | `stopped` | `expired`.
  - Recurrence frequency: `daily` | `weekly` | `monthly` | `every_N_months` | `yearly`.
  - Child invoices generated at 6 AM org timezone on schedule date.
  - `end_date` or `end_after_N_cycles` to auto-expire.
  - Auto-charge: if card saved for customer and auto-bill enabled, child invoice is charged automatically.
  - Manual invoice generation from profile (override schedule).
  - Stop / Resume profile.
  - `last_sent_at`, `next_invoice_date` tracked on profile.
  - Child invoices are regular invoices with `recurring_invoice_id` back-link.
  - Credit limit check: fires notification (not block) when child generation would breach limit.

- **Data model:**

  ```
  recurring_invoices
    id                   int auto_increment PK
    recurrence_name      text not null
    customer_id          int not null
    status               text default 'active'
      -- 'active'|'stopped'|'expired'
    frequency            text not null
      -- 'daily'|'weekly'|'monthly'|'every_2_months'|'every_3_months'|'every_6_months'|'yearly'
    start_date           text not null
    end_date             text
    end_after_cycles     int
    cycles_completed     int default 0
    next_invoice_date    text
    last_sent_at         timestamp null
    auto_bill_enabled    tinyint(1) default 0
    payment_terms        int
    currency_code        text
    exchange_rate        decimal(15,6) default 1
    line_items           json
    discount_type        text
    discount_value       decimal(15,2) default 0
    subtotal             decimal(15,2) default 0
    tax_total            decimal(15,2) default 0
    total                decimal(15,2) default 0
    notes                text
    terms                text
    template_id          int
    custom_fields        json
    created_by           int
    created_at           timestamp default current_timestamp
    updated_at           timestamp default current_timestamp on update current_timestamp
  ```

  Child invoices are rows in `invoices` with `recurring_invoice_id` set.

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | GET | `/api/recurring-invoices` | filters: `status`, `customer_id` |
  | POST | `/api/recurring-invoices` | compute first `next_invoice_date`; mutate then select |
  | GET | `/api/recurring-invoices/:id` | include child invoices summary |
  | PUT | `/api/recurring-invoices/:id` | recompute next_invoice_date if schedule changed |
  | DELETE | `/api/recurring-invoices/:id` | |
  | POST | `/api/recurring-invoices/:id/stop` | status → stopped |
  | POST | `/api/recurring-invoices/:id/resume` | status → active; recalculate next_invoice_date |
  | POST | `/api/recurring-invoices/:id/generate-now` | manual child invoice creation |
  | POST | `/api/recurring-invoices/:id/enable-autobill` | |
  | POST | `/api/recurring-invoices/:id/disable-autobill` | |
  | GET | `/api/recurring-invoices/:id/child-invoices` | paginated list |

- **Workflow / state machine:**

  ```
  active ──stop──► stopped ──resume──► active
  active ──end_date reached / cycles completed──► expired (scheduler)
  active ──generate (scheduler / manual)──► creates child invoice in invoices table
  ```

- **Automations:**
  - Generation scheduler: cron runs at 6 AM org timezone; queries `status = 'active' AND next_invoice_date <= today`; creates child invoice; increments `cycles_completed`; computes new `next_invoice_date`; sets `last_sent_at`.
  - Auto-bill: after child invoice created, if `auto_bill_enabled` and saved card exists, trigger gateway charge.
  - Expiry: if `end_date` reached or `cycles_completed >= end_after_cycles`, set profile to `expired`.
  - Credit limit breach: emit notification, do not block.

- **Personalized / better-than-Zoho:**
  - Revenue forecast widget: show projected MRR/ARR from active profiles on dashboard.
  - Pause (not just stop) with resume date — Zoho only has stop/resume without scheduled resume.
  - Per-child invoice override before send (add one-off line item to next cycle only).

- **Build status:** Partial (CRUD exists; scheduler, auto-bill, stop/resume, child linking are New).

---

### Payments Received

- **Purpose:** Record, track, and reconcile money received from customers — whether against specific invoices or as unapplied advance credit.

- **Zoho Books behaviour:**
  - Payment modes: `cash` | `check` | `creditcard` | `banktransfer` | `bankremittance` | `autotransaction` | `others`.
  - A single payment can be split across multiple invoices (specify amount per invoice).
  - Excess over outstanding invoices stored as unapplied customer credit; can be applied later.
  - Refund excess/advance payment partially or fully.
  - Bank account association for reconciliation.
  - `reference_number` for check number / transaction ID.
  - Online payments auto-record when gateway webhook fires; `status = 'success' | 'failure'`.
  - Withholding tax tracking per payment.

- **Data model:**

  ```
  payments_received
    id                   int auto_increment PK
    payment_number       text not null unique
    customer_id          int not null
    date                 text not null
    amount               decimal(15,2) not null
    amount_applied       decimal(15,2) default 0
    amount_refunded      decimal(15,2) default 0
    balance              decimal(15,2) default 0   -- amount - applied - refunded
    payment_mode         text not null
    reference_number     text
    bank_account_id      int
    gateway              text          -- 'stripe'|'razorpay'|'paypal'|etc
    gateway_transaction_id text
    status               text default 'success'    -- 'success'|'failure'
    tax_withheld         decimal(15,2) default 0
    notes                text
    custom_fields        json
    created_by           int
    created_at           timestamp default current_timestamp
    updated_at           timestamp default current_timestamp on update current_timestamp

  payment_invoice_applications
    id                   int auto_increment PK
    payment_id           int not null
    invoice_id           int not null
    amount_applied       decimal(15,2) not null
    created_at           timestamp default current_timestamp

  payment_refunds
    id                   int auto_increment PK
    payment_id           int not null
    amount               decimal(15,2) not null
    date                 text not null
    payment_mode         text
    reference_number     text
    notes                text
    created_at           timestamp default current_timestamp
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | GET | `/api/payments-received` | filters: `customer_id`, `from_date`, `to_date`, `payment_mode`, `status` |
  | POST | `/api/payments-received` | body: `{customer_id, amount, payment_mode, date, invoice_payments[{invoice_id, amount}], ...}`; mutate then select; updates invoice `amount_paid`, `amount_due`, `status` |
  | GET | `/api/payments-received/:id` | include applications, refunds |
  | PUT | `/api/payments-received/:id` | |
  | DELETE | `/api/payments-received/:id` | reverses applied amounts on invoices |
  | POST | `/api/payments-received/:id/refund` | body: `{amount, date, payment_mode}` |
  | POST | `/api/payments-received/webhook/:gateway` | gateway webhook; auto-record payment; idempotency via `gateway_transaction_id` |

  Important: `POST /payments-received` is a compound write — within a DB transaction: insert payment, insert payment_invoice_applications rows, update invoice `amount_paid`/`amount_due`/`status`, write audit ledger. MySQL has no RETURNING; select after each insert.

- **Workflow / state machine:**
  Payment records are immutable after creation (only refunds added). Delete reverses all linked invoice balances.

- **Automations:**
  - Auto-number: `PMT-{YYYY}-{seq:5}`.
  - Gateway webhook handler with idempotency check (`gateway_transaction_id` unique index).
  - On payment: update invoice statuses in same transaction.

- **Personalized / better-than-Zoho:**
  - Payment reconciliation assistant: flag payments where `amount > invoice total` and suggest credit note or advance application.
  - Gateway-agnostic webhook normaliser: one internal format regardless of Stripe/Razorpay/PayPal shape.
  - Audit ledger captures full gateway payload alongside normalised record for dispute resolution.

- **Build status:** Partial (CRUD exists; multi-invoice split, refunds, gateway webhook, audit integration are New).

---

### Credit Notes

- **Purpose:** Issue credit back to a customer (due to returns, overcharges, goodwill); can be applied against outstanding invoices or refunded.

- **Zoho Books behaviour:**
  - Statuses: `draft` | `open` | `closed` | `void`.
  - `balance` = `total - credits_applied - refunded`.
  - Apply to one or more invoices (partial or full); each application reduces credit note balance and invoice amount_due.
  - Refund: bank transfer / other mode; reduces balance.
  - Approval workflow.
  - Associated with original invoice (for tax compliance); Avalara integration uses original invoice date for tax rate.
  - Auto-apply credits: org setting to automatically apply available credits when invoices are created.
  - Credit note number: auto-generated with `CN-` prefix.
  - Line items with taxes (tax credit matches original tax charged).

- **Data model:**

  ```
  credit_notes
    id                  int auto_increment PK
    credit_note_number  text not null unique
    customer_id         int not null
    invoice_id          int           -- original invoice reference
    status              text default 'draft'
      -- 'draft'|'open'|'closed'|'void'
    date                text not null
    currency_code       text
    exchange_rate       decimal(15,6) default 1
    discount_type       text
    discount_value      decimal(15,2) default 0
    subtotal            decimal(15,2) default 0
    tax_total           decimal(15,2) default 0
    total               decimal(15,2) default 0
    credits_applied     decimal(15,2) default 0
    refunded_amount     decimal(15,2) default 0
    balance             decimal(15,2) default 0
    notes               text
    terms               text
    template_id         int
    approved_by         int
    approved_at         timestamp null
    custom_fields       json
    created_by          int
    created_at          timestamp default current_timestamp
    updated_at          timestamp default current_timestamp on update current_timestamp

  credit_note_line_items
    id              int auto_increment PK
    credit_note_id  int not null
    item_id         int
    description     text
    quantity        decimal(15,4)
    rate            decimal(15,4)
    tax_id          int
    tax_percentage  decimal(6,3) default 0
    line_total      decimal(15,2)
    sort_order      int default 0

  credit_note_applications
    id               int auto_increment PK
    credit_note_id   int not null
    invoice_id       int not null
    amount_applied   decimal(15,2) not null
    applied_at       timestamp default current_timestamp

  credit_note_refunds
    id               int auto_increment PK
    credit_note_id   int not null
    amount           decimal(15,2) not null
    date             text not null
    payment_mode     text
    reference_number text
    created_at       timestamp default current_timestamp
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | GET | `/api/credit-notes` | filters: `status`, `customer_id`, `from_date`, `to_date` |
  | POST | `/api/credit-notes` | auto-number; mutate then select |
  | GET | `/api/credit-notes/:id` | include line_items, applications, refunds |
  | PUT | `/api/credit-notes/:id` | draft/open only |
  | DELETE | `/api/credit-notes/:id` | draft only |
  | POST | `/api/credit-notes/:id/submit-approval` | |
  | POST | `/api/credit-notes/:id/approve` | status → open |
  | POST | `/api/credit-notes/:id/void` | |
  | POST | `/api/credit-notes/:id/apply` | body: `{invoice_id, amount}`; updates both balances; if CN balance = 0, status → closed |
  | POST | `/api/credit-notes/:id/refund` | body: `{amount, date, payment_mode}` |
  | GET | `/api/credit-notes/:id/pdf` | |

- **Workflow / state machine:**

  ```
  draft ──approve──► open ──apply to invoices──► (balance reduces) ──balance = 0──► closed
                          └──refund──► (balance reduces)
  open/draft ──void──► void
  ```

- **Automations:**
  - Auto-number: `CN-{YYYY}-{seq:5}`.
  - Auto-apply setting: on invoice creation, if customer has `open` credit notes, apply automatically (configurable).
  - Audit ledger on apply, refund, void.

- **Personalized / better-than-Zoho:**
  - Proactive credit notice: when a credit note is issued, suggest applying it to specific overdue invoices with highest days-overdue first.
  - Credit utilisation chart per customer on their panel.

- **Build status:** Partial (CRUD exists; apply, refund, approval, auto-apply are New).

---

### Sales Receipts

- **Purpose:** One-step document for point-of-sale transactions where payment is collected at the time of sale (no separate invoice + payment flow).

- **Zoho Books behaviour:**
  - Combines invoice and payment in a single document.
  - Statuses: none (always represents a completed payment — no draft/sent lifecycle).
  - Payment mode captured at creation.
  - Generates a receipt PDF for the customer.
  - Can be emailed or printed.
  - Refundable.
  - Used primarily for cash/card sales at POS; not for credit-term sales.

- **Data model:**

  ```
  sales_receipts
    id                  int auto_increment PK
    receipt_number      text not null unique
    customer_id         int not null
    date                text not null
    payment_mode        text not null
    reference_number    text
    currency_code       text
    exchange_rate       decimal(15,6) default 1
    subtotal            decimal(15,2) default 0
    tax_total           decimal(15,2) default 0
    total               decimal(15,2) default 0
    amount_refunded     decimal(15,2) default 0
    notes               text
    template_id         int
    custom_fields       json
    created_by          int
    created_at          timestamp default current_timestamp
    updated_at          timestamp default current_timestamp on update current_timestamp

  sales_receipt_line_items
    id              int auto_increment PK
    receipt_id      int not null
    item_id         int
    description     text
    quantity        decimal(15,4)
    rate            decimal(15,4)
    tax_id          int
    tax_percentage  decimal(6,3) default 0
    line_total      decimal(15,2)
    sort_order      int default 0
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | GET | `/api/sales-receipts` | filters: `customer_id`, `from_date`, `to_date`, `payment_mode` |
  | POST | `/api/sales-receipts` | auto-number; compute totals; mutate then select |
  | GET | `/api/sales-receipts/:id` | include line items |
  | PUT | `/api/sales-receipts/:id` | |
  | DELETE | `/api/sales-receipts/:id` | |
  | POST | `/api/sales-receipts/:id/send` | email receipt PDF |
  | POST | `/api/sales-receipts/:id/refund` | body: `{amount, payment_mode, date}` |
  | GET | `/api/sales-receipts/:id/pdf` | |

- **Workflow / state machine:**
  No state transitions — created as a completed transaction. Refund is an additive record; it does not change receipt status.

- **Automations:**
  - Auto-number: `SR-{YYYY}-{seq:5}`.
  - Tax computation server-side on save.

- **Personalized / better-than-Zoho:**
  - POS mode: simplified full-screen receipt creator with large touch targets; customer lookup by phone; print thermal receipt (80mm layout CSS).

- **Build status:** Partial (CRUD exists; refund, email, PDF, POS mode are New).

---

### Payment Links / Gateways

- **Purpose:** Ad-hoc shareable links for collecting one-off payments without creating a full invoice; also the gateway configuration underpinning all online payments across the module.

- **Zoho Books behaviour:**
  - Create payment link: select customer (or ad-hoc), enter amount, optional description, set expiry date, share via email or SMS.
  - Customer opens link → selects payment method → pays → link auto-records the payment.
  - Links are single-use or until expiry.
  - Gateway integrations: Stripe, PayPal, Authorize.Net, Braintree, Razorpay, 2Checkout, PayFlow Pro (varies by region).
  - Preferred gateway per customer contact.
  - Cards can be saved (tokenised) per customer for recurring auto-charge.
  - All online payments generate webhook events → idempotent handler auto-records.

- **Data model:**

  ```
  payment_links
    id                  int auto_increment PK
    link_token          text not null unique     -- random UUID used in URL
    customer_id         int
    amount              decimal(15,2) not null
    description         text
    currency_code       text default 'INR'
    gateway             text not null
    expiry_date         text                     -- DATE
    status              text default 'active'    -- 'active'|'paid'|'expired'|'cancelled'
    payment_id          int                      -- set once paid
    custom_fields       json
    created_by          int
    created_at          timestamp default current_timestamp
    updated_at          timestamp default current_timestamp on update current_timestamp

  gateway_configs
    id                  int auto_increment PK
    org_id              int default 1
    gateway             text not null unique     -- 'stripe'|'razorpay'|'paypal'|'authorize_net'
    enabled             tinyint(1) default 0
    config              json                     -- encrypted API keys / webhook secret
    is_default          tinyint(1) default 0
    created_at          timestamp default current_timestamp
    updated_at          timestamp default current_timestamp on update current_timestamp

  saved_cards
    id                  int auto_increment PK
    customer_id         int not null
    gateway             text not null
    gateway_customer_id text
    gateway_token       text not null
    last_four           text
    brand               text
    expiry_month        int
    expiry_year         int
    is_primary          tinyint(1) default 0
    created_at          timestamp default current_timestamp
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | GET | `/api/payment-links` | filters: `status`, `customer_id` |
  | POST | `/api/payment-links` | generate `link_token`; mutate then select |
  | GET | `/api/payment-links/:id` | |
  | DELETE | `/api/payment-links/:id` | cancel; status → cancelled |
  | GET | `/api/pub/pay/:token` | public; return link details for payment UI |
  | POST | `/api/pub/pay/:token/charge` | initiate gateway charge |
  | POST | `/api/gateways/webhook/:gateway` | gateway webhook; idempotency on `gateway_transaction_id` |
  | GET | `/api/gateway-configs` | list configured gateways |
  | PUT | `/api/gateway-configs/:gateway` | upsert config (keys stored encrypted) |
  | GET | `/api/customers/:id/saved-cards` | list tokenised cards |
  | DELETE | `/api/customers/:id/saved-cards/:cardId` | detach card from gateway + delete record |

  Scheduler: daily cron sets `status = 'expired'` where `expiry_date < today AND status = 'active'`.

- **Workflow / state machine:**

  ```
  active ──customer pays──► paid (+ creates payments_received record)
  active ──expiry_date passed (scheduler)──► expired
  active ──cancelled by user──► cancelled
  ```

- **Automations:**
  - Auto-expiry scheduler.
  - Webhook idempotency: `gateway_transaction_id` unique index; duplicate webhooks discarded.
  - On successful payment: insert `payments_received`, link back to `payment_links.payment_id`, notify creator.

- **Personalized / better-than-Zoho:**
  - Gateway abstraction layer: single `GatewayAdapter` interface; swap/add gateways without changing route handlers.
  - Payment link analytics: open count, time-to-pay histogram per link.
  - WhatsApp share option for payment links (via WhatsApp Business API) alongside email/SMS.

- **Build status:** Partial (basic payment_links CRUD noted; gateway config, saved cards, webhook handler, public pay UI are New).

---

### Customer Portal

- **Purpose:** Self-service web space where customers log in to view their transactions, accept quotes, pay invoices, download statements, and communicate.

- **Zoho Books behaviour:**
  - Access enabled per contact person (email-based invitation).
  - Portal home: account overview, outstanding amount, available credits.
  - **Transactions visible:** Quotes, Sales Orders, Invoices, Retainer Invoices, Delivery Challans, Recurring Invoices, Statements, Projects (if applicable).
  - **Actions:** Accept/decline quotes (with comment); pay invoices individually or in bulk; view/download PDF; forward to other contact persons.
  - **Saved cards:** manage stored cards for future auto-pay.
  - **Statements:** generate for any date range (self or including sub-customers).
  - **Account info:** update contact details, change portal password.
  - **Parent-child:** parent customer can view/pay sub-customer transactions (if enabled).
  - **Reviews:** submit a business review.
  - Portal URL is org-branded (`portal.yourdomain.com` or Zoho subdomain).
  - **Notifications:** customer receives email on new quote, invoice, payment confirmation.

- **Data model:**

  ```
  portal_sessions
    id                  int auto_increment PK
    contact_person_id   int not null
    customer_id         int not null
    token               text not null unique
    expires_at          timestamp not null
    created_at          timestamp default current_timestamp

  portal_activity_log
    id                  int auto_increment PK
    customer_id         int not null
    contact_person_id   int
    action              text not null   -- 'login'|'view_invoice'|'pay'|'accept_quote'|'decline_quote'|'download_pdf'
    document_type       text
    document_id         int
    metadata            json
    created_at          timestamp default current_timestamp
  ```

  Portal authentication uses short-lived JWT or `portal_sessions` token; completely separate from internal user auth.

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | POST | `/api/pub/portal/login` | body: `{email, password}`; returns portal session token |
  | POST | `/api/pub/portal/logout` | invalidate session |
  | GET | `/api/pub/portal/me` | customer + contact person info |
  | GET | `/api/pub/portal/overview` | outstanding, credits, recent activity |
  | GET | `/api/pub/portal/quotes` | paginated; filters: `status` |
  | GET | `/api/pub/portal/quotes/:id` | |
  | POST | `/api/pub/portal/quotes/:id/accept` | |
  | POST | `/api/pub/portal/quotes/:id/decline` | body: `{comment}` |
  | GET | `/api/pub/portal/invoices` | |
  | GET | `/api/pub/portal/invoices/:id` | |
  | POST | `/api/pub/portal/invoices/pay` | body: `{invoice_ids[], saved_card_id, amount_per_invoice[]}` |
  | GET | `/api/pub/portal/statements` | query: `from_date`, `to_date`, `include_sub_customers` |
  | GET | `/api/pub/portal/documents/:type/:id/pdf` | stream PDF |
  | GET | `/api/pub/portal/saved-cards` | |
  | DELETE | `/api/pub/portal/saved-cards/:id` | |

- **Workflow / state machine:**
  Portal is a read/action surface — underlying document state machines govern; portal actions call the same internal service layer as admin API.

- **Automations:**
  - Portal invite email sent on `POST /api/customers/:id/portal-invite`.
  - Session expiry: `expires_at` checked on each portal request.
  - Notification emails: on new invoice sent to customer, on payment confirmation, on quote acceptance (to org).

- **Personalized / better-than-Zoho:**
  - Real-time payment status updates via Server-Sent Events or WebSocket so customer sees "Payment Processing → Confirmed" without page refresh.
  - In-portal dispute/query: customer can raise a query on a specific invoice line item; creates an internal ticket visible to admin.
  - White-label domain + custom CSS theming (org uploads logo, sets brand colours for portal).
  - Audit ledger records every portal action (Zoho's portal has no exportable audit trail).

- **Build status:** New.

---

### Sales Tax on Documents

- **Purpose:** Correctly compute, display, and record tax obligations on all AR documents; support multiple tax regimes (percentage-based, compound, grouped) with per-item and per-customer overrides.

- **Zoho Books behaviour:**
  - **Tax rates**: name, percentage, tax authority. Multiple rates per org.
  - **Tax groups**: club individual rates (e.g., CGST 9% + SGST 9% = GST 18%) into a single selectable group; presented as one line on documents, exploded in tax ledger.
  - **Compound taxes**: tax applied on top of another tax (tax-on-tax); stored as `is_compound = true` with `base_tax_id`.
  - **Application**: per line item (`tax_id`); can override to non-taxable per line.
  - **Customer-level default**: `tax_id` on customer auto-fills when selecting that customer.
  - **Item-level default**: `tax_id` on item auto-fills when adding that item.
  - **Exemptions**: customer or item marked non-taxable; exemption reason + tax authority stored.
  - **Tax totals on document**: `subtotal` (pre-tax/discount) → `discount_total` → taxable_amount → `tax_total` → `shipping_charge` → `adjustment` → `total`.
  - **Inclusive vs exclusive**: rates can be tax-inclusive (rate already includes tax) or exclusive.
  - All sales tax operations on invoices apply equally to estimates, SOs, credit notes, retainers, delivery challans.

- **Data model:**

  ```
  taxes
    id              int auto_increment PK
    name            text not null
    percentage      decimal(6,3) not null
    tax_authority   text
    is_compound     tinyint(1) default 0
    base_tax_id     int                    -- compound: applied on top of this tax
    is_inclusive    tinyint(1) default 0   -- rate is tax-inclusive
    created_at      timestamp default current_timestamp

  tax_groups
    id              int auto_increment PK
    name            text not null
    tax_ids         json                   -- [tax_id, ...]
    total_percentage decimal(6,3)          -- sum of component rates
    created_at      timestamp default current_timestamp

  tax_exemptions
    id              int auto_increment PK
    name            text not null
    description     text
    tax_authority   text
    created_at      timestamp default current_timestamp
  ```

  Tax computation is pure server-side logic; no DB table needed for computed tax amounts per document (those live in `invoice_taxes`, `quote_taxes`, etc., as exploded rows for reporting).

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | GET | `/api/taxes` | list all rates |
  | POST | `/api/taxes` | |
  | PUT | `/api/taxes/:id` | |
  | DELETE | `/api/taxes/:id` | block if in use |
  | GET | `/api/tax-groups` | |
  | POST | `/api/tax-groups` | |
  | PUT | `/api/tax-groups/:id` | |
  | DELETE | `/api/tax-groups/:id` | |
  | GET | `/api/tax-exemptions` | |
  | POST | `/api/tax-exemptions` | |
  | POST | `/api/taxes/compute` | body: `{line_items[], discount, shipping}`; returns computed totals — used by frontend for live preview |

  The `/api/taxes/compute` endpoint is essential: it lets the frontend show live tax calculations without saving the document, so the UX is responsive while server remains the authoritative calculator.

- **Workflow / state machine:**
  Tax is a calculation, not a document — no state machine. Tax rates must be immutable once used on a finalised document (copy percentage at invoice creation time into `invoice_taxes`; do not reference live tax rate on closed documents).

- **Automations:**
  - Server-side tax recomputation on every save of any AR document.
  - Tax rate change does NOT retroactively update saved documents (snapshot at creation time).

- **Personalized / better-than-Zoho:**
  - Tax preview panel in document editor: shows tax breakdown live as line items are added.
  - Tax liability report: per-period, per-tax-authority, ready for filing — surfaced directly from `invoice_taxes` aggregate.
  - Warn if a customer has no tax treatment set when creating an invoice (avoids silent zero-tax mistake).

- **Build status:** New (taxes table may exist; tax groups, exemptions, compound taxes, per-document tax snapshot rows, compute endpoint are New).

---

### PDF Templates & Email

- **Purpose:** Generate branded, printable/downloadable PDF documents for every AR document type, and send formatted transactional emails with correct content per document.

- **Zoho Books behaviour:**
  - **Template types**: per-module (Invoice, Quote, Sales Order, Credit Note, Retainer Invoice, Delivery Challan, Sales Receipt, Statement).
  - **Two authoring modes**:
    1. Visual editor (pre-built layouts, pick fields, choose colour theme, upload logo).
    2. HTML/CSS editor: full design control; supports Handlebars-like placeholder variables.
  - **Template fields**: header (logo, org details, doc number, date, due date), line item table (columns configurable), totals block (subtotal, discounts, taxes, total, amount due), footer (notes, terms, bank details, QR code, signature, payment stub for tear-off).
  - **Paper size/orientation**: A4, Letter; portrait/landscape.
  - **Set default**: per module or per customer (customer-specific template overrides module default).
  - **Clone templates** across modules.
  - **Email templates**: per event (Invoice Sent, Payment Received, Quote Accepted, Reminder, etc.); support placeholders; customisable subject + body; HTML.
  - **PDF generation**: server-side; typically via Puppeteer/headless Chrome or Pdfmake.
  - **Digital signature**: image upload placed on PDF.
  - **QR code**: embeds link to payment or document view.

- **Data model:**

  ```
  pdf_templates
    id                int auto_increment PK
    name              text not null
    module            text not null
      -- 'invoice'|'quote'|'sales_order'|'credit_note'|'retainer'|'challan'|'receipt'|'statement'
    is_default        tinyint(1) default 0
    paper_size        text default 'A4'
    orientation       text default 'portrait'
    html_content      text                   -- full HTML/CSS template with {{placeholders}}
    config            json                   -- visual-editor settings (colours, logo, column config)
    created_by        int
    created_at        timestamp default current_timestamp
    updated_at        timestamp default current_timestamp on update current_timestamp

  customer_template_overrides
    id                int auto_increment PK
    customer_id       int not null
    module            text not null
    template_id       int not null

  email_templates
    id                int auto_increment PK
    event             text not null unique
      -- 'invoice_sent'|'payment_received'|'quote_sent'|'reminder'|'credit_note_sent'|etc.
    subject           text not null
    body_html         text not null
    created_by        int
    created_at        timestamp default current_timestamp
    updated_at        timestamp default current_timestamp on update current_timestamp
  ```

- **API (contract-first):**

  | Method | Path | Notes |
  |--------|------|-------|
  | GET | `/api/pdf-templates` | filter: `module` |
  | POST | `/api/pdf-templates` | |
  | GET | `/api/pdf-templates/:id` | |
  | PUT | `/api/pdf-templates/:id` | |
  | DELETE | `/api/pdf-templates/:id` | block if is_default and no other template for module |
  | POST | `/api/pdf-templates/:id/set-default` | unsets previous default for same module |
  | POST | `/api/pdf-templates/:id/clone` | body: `{target_module?}` |
  | GET | `/api/pdf-templates/:id/preview` | renders sample PDF; returns PDF binary or base64 |
  | GET | `/api/email-templates` | |
  | GET | `/api/email-templates/:event` | |
  | PUT | `/api/email-templates/:event` | |
  | POST | `/api/email-templates/:event/preview` | renders email with sample data |
  | PUT | `/api/customers/:id/template-override` | body: `{module, template_id}` |

  PDF rendering: `GET /api/invoices/:id/pdf` → looks up template (customer override → module default → built-in fallback) → renders HTML with document data → Puppeteer → stream `application/pdf`.

- **Workflow / state machine:**
  Templates are configuration — no state transitions.

- **Automations:**
  - Email queue: on `POST /invoices/:id/send`, resolve email template for `invoice_sent` event, render with document data, enqueue (BullMQ or similar), deliver asynchronously.
  - Reminder emails use `reminder` email template with configurable copy.

- **Personalized / better-than-Zoho:**
  - Live HTML template editor with split preview pane (edit Handlebars HTML on left; rendered PDF preview auto-refreshes on right) — Zoho's HTML editor requires manual preview clicks.
  - Template version history: each save creates a version row; roll back to any prior version.
  - AI-assisted template suggestions: given org branding colours and logo, generate a starter HTML template.
  - Per-language templates: if org serves customers in multiple locales, assign language-specific templates per customer.

- **Build status:** New.

---

## Auto-Numbering Convention Summary

| Module | Format | Example |
|--------|--------|---------|
| Quotes | `QT-{YYYY}-{00001}` | QT-2026-00001 |
| Retainer Invoices | `RI-{YYYY}-{00001}` | RI-2026-00001 |
| Sales Orders | `SO-{YYYY}-{00001}` | SO-2026-00001 |
| Delivery Challans | `DC-{YYYY}-{00001}` | DC-2026-00001 |
| Invoices | `INV-{YYYY}-{00001}` | INV-2026-00001 |
| Credit Notes | `CN-{YYYY}-{00001}` | CN-2026-00001 |
| Payments Received | `PMT-{YYYY}-{00001}` | PMT-2026-00001 |
| Sales Receipts | `SR-{YYYY}-{00001}` | SR-2026-00001 |

Sequences live in an `auto_number_sequences` table (`{module, year, last_seq}`); increment is atomic (`UPDATE … SET last_seq = last_seq + 1` then `SELECT`).

---

## Document Conversion Map

```
Quote ──────────────────────────────► Invoice
      └────────────────────────────► Sales Order ──► Delivery Challan ──► Invoice
                                               └────────────────────────► Invoice (partial)
      └────────────────────────────► Retainer Invoice ──► apply to Invoice
                                                       └──► refund

Recurring Invoice Profile ──(schedule)──► Invoice (child)
```

All conversions inherit: `customer_id`, `line_items`, `addresses`, `currency_code`, `exchange_rate`, `discount_*`, `tax_*`. The source document records the target document id in a `converted_to_*` field; source status is updated accordingly.

---

## Scheduled Jobs Summary

| Job | Frequency | Action |
|-----|-----------|--------|
| Overdue invoices | Daily 00:05 org-tz | `status → overdue` where `due_date < today AND status IN ('sent','partially_paid')` |
| Quote expiry | Daily 00:10 org-tz | `status → expired` where `expiry_date < today AND status = 'sent'` |
| Recurring invoice generation | Daily 06:00 org-tz | Generate child invoices for active profiles due today |
| Payment reminders | Daily 08:00 org-tz | Evaluate reminder rules; send emails; log to `reminder_log` |
| Payment link expiry | Daily 00:15 org-tz | `status → expired` where `expiry_date < today AND status = 'active'` |
| Recurring profile expiry | Daily 06:05 org-tz | `status → expired` where end condition met |
| Late fee application | Daily 01:00 org-tz | Add late fee lines to eligible overdue invoices |


---

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


---

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


---


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


---

## 5. Items, Inventory & Price Lists

## Overview

This section covers the complete catalogue layer of the Astram Financial Portal: every sellable or purchasable thing the business tracks, how stock moves, how it is valued, and how prices vary by customer tier, volume, or currency. Zoho Books ships a functional subset of inventory; the deeper features (multi-warehouse, serial/batch tracking, composite assembly, transfer orders) live in **Zoho Inventory** — an add-on that requires a paid Zoho Inventory org. Each sub-feature below is labelled **[Books]** (native), **[Books+Addon]** (requires Inventory add-on inside Books), or **[Inventory-tier]** (full Zoho Inventory product only). We implement all tiers natively in the portal.

**Sub-features:**
1. Items — goods, services & digital (SKU, HSN/SAC, tax, accounts)
2. Item Groups & Variant Attributes
3. Composite / Bundle Items (Assembly & Kit)
4. Inventory Tracking (stock on hand, reorder, valuation FIFO/avg)
5. Stock Adjustments (quantity & value, approval)
6. Inventory Valuation & COGS Auto-Journaling
7. Price Lists (percentage, per-item, volume/quantity brackets, multi-currency)
8. Item Images & Custom Fields
9. Warehouses & Stock Transfers *(Inventory-tier)*
10. Reports: Summary, Valuation, FIFO Lot, ABC, Adjustment

---

### 5.1 Items (Goods, Services & Digital)

- **Purpose:** Master catalogue — every thing the business buys or sells, with pricing, accounts, and tax metadata.

- **Zoho Books behaviour [Books]:**
  - `product_type`: `goods | service | digital_service` (region-specific: `capital_service`, `capital_goods` for South Africa).
  - `item_type`: `sales | purchases | sales_and_purchases | inventory`. Only `inventory` type participates in stock tracking.
  - Fields: `name` (max 100 chars), `sku` (unique), `unit`, `rate` (selling price), `purchase_rate`, `description` (max 2000 chars), `purchase_description`.
  - Accounting: `account_id` (revenue/sales account), `purchase_account_id` (COGS account), `inventory_account_id` (stock asset account).
  - Tax: `is_taxable`, `tax_id`, `tax_percentage`, `tax_exemption_id` (if non-taxable); India: `item_tax_preferences[]` (array of tax_id + tax_specification for GST components); India/Kenya/ZA: `hsn_or_sac`.
  - `vendor_id` (preferred supplier), `reorder_level`.
  - Lifecycle: Active / Inactive — inactive items cannot be added to new transactions but historical records are preserved.
  - Duplicate names allowed only when SKU is mandatory (org preference toggle).
  - MRP (India): define MRP per item; tax calculated on MRP for applicable HSN codes; overridable at line-item level.
  - Portal, customer-facing: items can be added/removed from customer portal.

- **Data model:**
  ```
  items
    id                    int autoincrement PK
    org_id                int not null
    name                  varchar(100) not null
    sku                   varchar(100) unique
    product_type          enum('goods','service','digital_service') not null default 'goods'
    item_type             enum('sales','purchases','sales_and_purchases','inventory') not null
    unit                  varchar(50)
    description           text
    purchase_description  text
    rate                  decimal(15,2) not null default 0.00   -- selling price
    purchase_rate         decimal(15,2)                         -- cost price / purchase price
    mrp                   decimal(15,2)                         -- maximum retail price (India)
    account_id            int                                   -- revenue account (FK-free ref to accounts)
    purchase_account_id   int                                   -- COGS account
    inventory_account_id  int                                   -- stock asset account
    tax_id                int
    tax_percentage        decimal(6,3)
    is_taxable            tinyint(1) not null default 1
    tax_exemption_id      int
    hsn_or_sac            varchar(20)
    vendor_id             int
    reorder_level         decimal(15,4) default 0.0000
    status                enum('active','inactive') not null default 'active'
    custom_fields         json
    created_at            timestamp not null default current_timestamp
    updated_at            timestamp not null default current_timestamp on update current_timestamp
    hash                  varchar(64)                           -- audit ledger chain hash
  ```

- **API (contract-first):**
  ```
  POST   /api/items                         Create item → mutate then SELECT by insert id
  GET    /api/items                         List; filters: status, item_type, product_type, search, page, limit
  GET    /api/items/:id                     Get single item with stock summary if inventory type
  PUT    /api/items/:id                     Update → mutate then SELECT
  DELETE /api/items/:id                     Soft-delete (set status=inactive); hard-delete if never used
  POST   /api/items/:id/activate            Set status=active → mutate then SELECT
  POST   /api/items/:id/deactivate          Set status=inactive → mutate then SELECT
  GET    /api/items/bulk                    Bulk fetch by ids[] query param
  PUT    /api/items/:id/custom-fields       Update custom_fields JSON → mutate then SELECT
  ```
  Request body (create/update): `{ name, sku?, product_type, item_type, unit?, description?, purchase_description?, rate, purchase_rate?, mrp?, account_id?, purchase_account_id?, inventory_account_id?, tax_id?, is_taxable, tax_exemption_id?, hsn_or_sac?, vendor_id?, reorder_level?, custom_fields? }`.
  Response: full item object + `stock_on_hand` (computed) if `item_type=inventory`.
  MySQL has NO RETURNING — all mutations use `INSERT/UPDATE` then `SELECT … WHERE id = lastInsertId / :id`.

- **Workflow / state machine:**
  ```
  Draft (new) → Active → Inactive
                ↑_____________|   (re-activate)
  ```
  Inventory-type items: stock movements triggered by invoice confirmation (debit COGS, credit Inventory Asset) and bill confirmation (debit Inventory Asset, credit AP).

- **Automations:**
  - Reorder alert: background job polls `stock_on_hand <= reorder_level`; enqueues notification + optional PO draft.
  - MRP tax recalculation job when HSN/SAC or MRP changes.
  - Audit ledger: every create/update/deactivate writes a hash-chained entry to `audit_ledger` (field-level diff, actor, timestamp, prev_hash).
  - Webhook events: `item.created`, `item.updated`, `item.deactivated`.

- **Personalized / better-than-Zoho:**
  - Barcode/QR generation endpoint (`GET /api/items/:id/barcode?format=qr|code128`) — Zoho requires a separate barcode label feature.
  - Inline tax-impact preview: API returns `effective_tax_rate` + `tax_components[]` at item level.
  - Full audit trail at field level (not just record level) via hash-chained ledger.
  - Bulk import with per-row error reporting (not a silent partial import).
  - `duplicate` endpoint (`POST /api/items/:id/duplicate`) to clone an item with a new SKU.

- **Build status:** New. No dependencies on Sales/Purchases yet (accounts must exist first; `account_id` is a soft reference, no FK).

---

### 5.2 Item Groups & Variant Attributes

- **Purpose:** Group a family of related items (e.g., T-Shirt in S/M/L × Blue/Red) under one parent, each variant tracked independently as an item.

- **Zoho Books behaviour [Books+Addon / Inventory-tier]:**
  - An **item group** is a parent container; each combination of attribute values generates a **variant** which is treated as a full item with its own SKU, price, and inventory.
  - Attributes: name (e.g. "Color") + options (e.g. "Blue, Red, White"). Up to ~3 attributes per group typical; system generates all permutations.
  - SKU generation: pattern-based auto-SKU using attribute initials + separators (-, /, :, ., #) + custom text prefix.
  - Per-variant: `cost_price`, `selling_price`, UPC/EAN/MPN/ISBN identifiers, opening stock, custom fields.
  - Bulk copy-to-all for price across all variants.
  - Only inventory-tracked items can belong to a group.
  - Variants appear as independent items in transactions and reports.

- **Data model:**
  ```
  item_groups
    id            int autoincrement PK
    org_id        int not null
    name          varchar(100) not null
    description   text
    attributes    json   -- [{ name: "Color", options: ["Blue","Red"] }, ...]
    status        enum('active','inactive') default 'active'
    created_at    timestamp
    updated_at    timestamp
    hash          varchar(64)

  item_variants
    id              int autoincrement PK
    group_id        int not null           -- ref item_groups.id (no FK)
    item_id         int not null           -- ref items.id (no FK) — variant IS an item
    attribute_combo json                   -- { "Color": "Blue", "Size": "M" }
    sku             varchar(100) unique
    selling_price   decimal(15,2)
    cost_price      decimal(15,2)
    upc             varchar(50)
    ean             varchar(50)
    mpn             varchar(50)
    isbn            varchar(50)
    created_at      timestamp
    updated_at      timestamp
  ```
  Each variant row points to a full row in `items` — the item row holds stock, accounts, tax. `item_variants` carries only the variant-specific differentiators.

- **API (contract-first):**
  ```
  POST   /api/item-groups                  Create group + generate variant items → mutate then SELECT
  GET    /api/item-groups                  List groups; filter: status, search
  GET    /api/item-groups/:id              Get group with all variants
  PUT    /api/item-groups/:id              Update group name/description/attributes → re-sync variants
  DELETE /api/item-groups/:id             Deactivate group + all variants
  GET    /api/item-groups/:id/variants     List variants with stock
  POST   /api/item-groups/:id/variants     Add new variant (new attribute combo)
  PUT    /api/item-groups/:id/variants/bulk-price  Bulk update selling/cost price across all variants
  POST   /api/item-groups/:id/generate-skus        Generate SKU pattern for all variants
  ```

- **Workflow / state machine:**
  ```
  Group created → Variants auto-generated (status: active)
  Attribute added → New variant items created
  Group deactivated → All variant items deactivated
  ```

- **Automations:**
  - Adding an attribute option triggers background variant-generation job; logs each new item to audit ledger.
  - SKU conflict detection at generation time with user-resolvable conflicts surfaced via API error payload.

- **Personalized / better-than-Zoho:**
  - Variant matrix UI: grid view (rows = one attribute, cols = another) for bulk price/stock entry — Zoho's UI is list-only.
  - API exposes `attribute_combos_missing` to flag incomplete matrix (e.g. Size M × Color Red exists but Size M × Color Blue does not).
  - Barcode sheet export: `GET /api/item-groups/:id/barcodes` returns PDF-ready label sheet for all variants.

- **Build status:** New. Depends on Items (5.1). Variant items are rows in `items` table.

---

### 5.3 Composite / Bundle Items (Assembly & Kit)

- **Purpose:** Sell or produce items composed of multiple components — either as physically assembled finished goods (Assembly) or as grouped-but-separate items sold as one unit (Kit/Bundle).

- **Zoho Books behaviour [Books+Addon / Inventory-tier]:**
  - **Assembly:** Component stock is consumed; the assembly gains its own stock pool. A "manufacture" transaction (assembly order) is created to record production. COGS reflects component costs.
  - **Kit:** No physical assembly; components are tracked independently. The kit has no independent stock — at sale, each component's stock decreases proportionally.
  - Both types: define BOM (Bill of Materials) — list of components + quantities. Components can themselves be composite items (nested BOM).
  - Custom pricing for kits (discount from sum-of-parts).
  - Both have `selling_price` and `cost_price` (for kits, cost = sum of component costs).
  - Kit pricing can be customized independently of component sum.

- **Data model:**
  ```
  composite_items
    id              int autoincrement PK
    item_id         int not null          -- ref items.id (the composite item's own item row)
    composite_type  enum('assembly','kit') not null
    description     text
    created_at      timestamp
    updated_at      timestamp
    hash            varchar(64)

  composite_components
    id                int autoincrement PK
    composite_item_id int not null        -- ref composite_items.id
    component_item_id int not null        -- ref items.id (the component)
    quantity          decimal(15,4) not null
    unit              varchar(50)
    sort_order        int default 0
    created_at        timestamp
  ```
  Assembly items have their own row in `items` with `item_type=inventory`. Kit items: `item_type=sales` (no stock pool of their own).

- **API (contract-first):**
  ```
  POST   /api/composite-items              Create composite + BOM → mutate then SELECT
  GET    /api/composite-items              List; filter: composite_type, status
  GET    /api/composite-items/:id          Get with BOM + component stock levels
  PUT    /api/composite-items/:id          Update BOM → mutate then SELECT
  DELETE /api/composite-items/:id         Deactivate

  -- Assembly production:
  POST   /api/assembly-orders              Create assembly run (consume components, produce finished goods)
  GET    /api/assembly-orders              List
  GET    /api/assembly-orders/:id          Get with component consumption detail
  POST   /api/assembly-orders/:id/confirm  Confirm → trigger stock movements + COGS journal
  POST   /api/assembly-orders/:id/cancel   Cancel (reverse stock movements if already applied)
  ```

- **Workflow / state machine (Assembly):**
  ```
  Assembly Order: Draft → Confirmed → (Cancelled)
  On Confirm:
    - Deduct component quantities from stock_movements (type=assembly_consumption)
    - Credit assembly item stock (type=assembly_production)
    - Journal: Dr Inventory Asset (assembly), Cr Inventory Asset (components) × each component cost (FIFO)
  ```
  Kit: no assembly order needed — stock deduction happens at invoice confirmation time per component.

- **Automations:**
  - `assembly.stock_low` alert: if any component stock < required quantity for a planned assembly run.
  - Auto-cost recalculation when component `purchase_rate` changes: background job recomputes `composite_items` effective cost and notifies if kit custom price is now below cost.
  - Audit ledger entries for every BOM change and every assembly order state transition.

- **Personalized / better-than-Zoho:**
  - Nested BOM depth display (tree view of sub-assemblies) — Zoho Inventory supports nested composites but the UI is flat.
  - `GET /api/composite-items/:id/build-feasibility?quantity=N` returns per-component availability and shortfall — build your own "can I make N units?" check endpoint.
  - Assembly order costing uses portal's own FIFO lot engine (not Zoho's opaque backend).

- **Build status:** New. Depends on Items (5.1), Inventory Tracking (5.4), Inventory Valuation (5.6). Assembly orders depend on Sales/Purchases line items for GL posting.

---

### 5.4 Inventory Tracking (Stock On Hand, Reorder, Valuation Methods)

- **Purpose:** Real-time stock level visibility per item (and per warehouse), with configurable valuation method driving COGS and asset values.

- **Zoho Books behaviour [Books]:**
  - Only `item_type=inventory` items are tracked.
  - Stock auto-updated on: invoice confirmed (out), bill confirmed (in), credit note (in), vendor credit (out), sales order (reserved/committed), purchase order (on-order).
  - Stock states per item: `stock_on_hand`, `committed_stock` (reserved on open sales orders), `available_for_sale` (on_hand − committed), `stock_on_order` (open PO qty).
  - Reorder level: `reorder_level` field on item; system alerts when `stock_on_hand <= reorder_level`.
  - Valuation: Zoho Books uses **FIFO** exclusively. Zoho Inventory adds weighted average. We implement both.
  - Opening stock: set at item creation or via initial stock adjustment (with `initial_stock_rate`).
  - Location-level stock: `locations[]` array on item with `location_stock_on_hand`, `location_available_stock` (Books shows location stock when Inventory add-on enabled).

- **Data model:**
  ```
  stock_movements
    id              int autoincrement PK
    org_id          int not null
    item_id         int not null
    movement_type   enum('purchase','sale','adjustment_qty','adjustment_val',
                         'assembly_consumption','assembly_production',
                         'transfer_out','transfer_in','opening','return_in','return_out') not null
    reference_type  varchar(50)           -- 'invoice'|'bill'|'adjustment'|'assembly_order'|'transfer_order'
    reference_id    int
    quantity        decimal(15,4) not null  -- positive=in, negative=out
    unit_cost       decimal(15,6)           -- cost per unit at time of movement (FIFO lot cost)
    total_cost      decimal(15,2)           -- quantity × unit_cost
    warehouse_id    int                     -- null = default warehouse
    movement_at     timestamp not null
    created_at      timestamp not null default current_timestamp
    hash            varchar(64)             -- audit chain

  stock_summary                            -- materialized/denormalized for fast reads
    id              int autoincrement PK
    org_id          int not null
    item_id         int not null unique
    stock_on_hand   decimal(15,4) not null default 0.0000
    committed_stock decimal(15,4) not null default 0.0000
    on_order        decimal(15,4) not null default 0.0000
    avg_cost        decimal(15,6)           -- for weighted-average orgs
    fifo_layers     json                    -- [{qty, unit_cost, date},...] remaining FIFO lots
    last_updated    timestamp

  org_inventory_settings
    org_id              int PK
    valuation_method    enum('fifo','average') not null default 'fifo'
    track_inventory     tinyint(1) default 1
    decimal_qty_places  tinyint default 2
    out_of_stock_warn   tinyint(1) default 1
    allow_negative_stock tinyint(1) default 0
  ```

- **API (contract-first):**
  ```
  GET    /api/items/:id/stock              Current stock summary (on_hand, committed, available, on_order, fifo_layers)
  GET    /api/items/:id/stock/movements    Paginated movement history; filter: type, date_from, date_to
  GET    /api/stock/summary                Org-wide stock summary table; filter: low_stock=true, out_of_stock=true
  GET    /api/stock/valuation              Inventory valuation report (item × qty × avg_cost × total_value)
  ```
  All stock mutations happen indirectly: invoice/bill/adjustment endpoints write to `stock_movements` and update `stock_summary`. No direct stock-write endpoint (prevents bypassing audit trail).

- **Workflow / state machine:**
  ```
  Invoice confirmed   → stock_movement(sale, qty=-N, unit_cost=FIFO_lot_cost)
                        → stock_summary.stock_on_hand -= N
                        → COGS journal posted (5.6)
  Bill confirmed      → stock_movement(purchase, qty=+N, unit_cost=bill_line_rate)
                        → stock_summary.stock_on_hand += N
                        → fifo_layers updated (new lot appended)
                        → Inventory Asset journal posted (5.6)
  Invoice voided      → reversal stock_movement posted
  Sales Order placed  → stock_summary.committed_stock += N (no movement)
  Sales Order closed  → committed_stock -= N
  PO placed           → stock_summary.on_order += N
  PO received         → on_order -= N, stock_on_hand += N
  ```

- **Automations:**
  - Reorder alert daemon: scheduled job (every 15 min) scans `stock_summary` where `stock_on_hand <= items.reorder_level`; pushes notification + creates optional draft PO.
  - Out-of-stock warning: real-time check on invoice/sales-order line-item entry; API returns `insufficient_stock: true` with `available_for_sale` in response.
  - FIFO lot recalculation job: triggered on bill void/amendment to re-layer affected lots and recompute downstream COGS.

- **Personalized / better-than-Zoho:**
  - Both FIFO and weighted-average supported (Zoho Books only FIFO; weighted-average only in Inventory-tier).
  - `allow_negative_stock` setting (Zoho Books prevents it; portal can permit with warning for service-based workflows that pre-invoice).
  - `GET /api/stock/low-stock-forecast?days=30` — demand-based depletion forecast using rolling sales velocity; flags items likely to hit reorder in the window.
  - Real-time stock committed/available split visible at line-item entry (not just a report).
  - Every stock movement is a hash-chained audit ledger entry — tamper-evident.

- **Build status:** New. Depends on Items (5.1). Movements triggered by Sales Invoices, Purchase Bills, Credit Notes, and Adjustments (all future modules).

---

### 5.5 Stock Adjustments (Quantity & Value)

- **Purpose:** Correct stock levels or valuation outside normal buy/sell transactions (shrinkage, damage, write-off, opening stock correction, revaluation).

- **Zoho Books behaviour [Books]:**
  - **Quantity Adjustment:** increase or decrease stock count. Use cases: theft, damaged goods, found stock, opening stock correction. Journal: Dr/Cr Inventory Account vs Inventory Adjustment (P&L) account.
  - **Value Adjustment:** change the per-unit value of existing stock without changing quantity. Use cases: commodity price change (e.g. steel price rise). Journal: Dr/Cr Inventory Account vs Inventory Revaluation account.
  - Reason field (free text). Date field. Reference number.
  - No built-in approval workflow in Zoho Books — any user with items permission can post.
  - Adjustments appear in `Inventory Adjustment Summary` and `Inventory Adjustment Details` reports.
  - Deletion allowed; deletes reverse the journal.

- **Data model:**
  ```
  inventory_adjustments
    id                int autoincrement PK
    org_id            int not null
    adjustment_number varchar(50)           -- auto-generated sequence
    adjustment_type   enum('quantity','value') not null
    adjustment_date   timestamp not null
    account_id        int                   -- adjustment account (expense/P&L side)
    reason            text
    reference_number  varchar(100)
    status            enum('draft','pending_approval','approved','rejected','posted','voided') not null default 'draft'
    approved_by       int                   -- user id
    approved_at       timestamp
    notes             text
    created_by        int not null
    created_at        timestamp
    updated_at        timestamp
    hash              varchar(64)

  inventory_adjustment_lines
    id              int autoincrement PK
    adjustment_id   int not null
    item_id         int not null
    warehouse_id    int
    -- for quantity adjustments:
    quantity_delta  decimal(15,4)           -- positive=increase, negative=decrease
    unit_cost       decimal(15,6)           -- cost at which qty is adjusted
    -- for value adjustments:
    value_delta     decimal(15,2)           -- positive=increase, negative=decrease
    new_unit_value  decimal(15,6)           -- resulting unit value
    created_at      timestamp
  ```

- **API (contract-first):**
  ```
  POST   /api/inventory-adjustments                      Create adjustment (draft) → mutate then SELECT
  GET    /api/inventory-adjustments                      List; filter: type, status, date_from, date_to, item_id
  GET    /api/inventory-adjustments/:id                  Get with lines
  PUT    /api/inventory-adjustments/:id                  Update draft → mutate then SELECT
  POST   /api/inventory-adjustments/:id/submit           Submit for approval (draft → pending_approval)
  POST   /api/inventory-adjustments/:id/approve          Approve (pending → approved → triggers posting)
  POST   /api/inventory-adjustments/:id/reject           Reject with reason
  POST   /api/inventory-adjustments/:id/post             Post approved adjustment → stock_movements + GL journal
  POST   /api/inventory-adjustments/:id/void             Void posted adjustment (reversal entries)
  DELETE /api/inventory-adjustments/:id                  Delete draft only
  ```

- **Workflow / state machine:**
  ```
  Draft → Pending Approval → Approved → Posted → (Voided)
       ↘ (if approval not required)→ Posted directly
  Rejected ← Pending Approval
  ```
  On Post:
  - Quantity adj: writes `stock_movement` (type=adjustment_qty) + GL journal (Dr/Cr Inventory Asset vs Adjustment Account).
  - Value adj: updates `stock_summary.avg_cost` / `fifo_layers` values + GL journal (Dr/Cr Inventory Asset vs Revaluation Account).

- **Automations:**
  - Approval threshold: org setting — adjustments > `approval_threshold_amount` auto-route to pending_approval; below threshold auto-post.
  - Notification to inventory managers on submission.
  - Audit ledger entry on every state transition with actor + reason.
  - Monthly scheduled job: flags items with net adjustment > X% of opening stock as anomalies for review.

- **Personalized / better-than-Zoho:**
  - Approval workflow (Zoho Books has none).
  - Void with reversal (Zoho Books only allows deletion, which doesn't leave an audit trail).
  - Bulk adjustment import via CSV with dry-run preview before posting.
  - Adjustment anomaly detection surfaced in dashboard (items with unusually high adjustment rates).

- **Build status:** New. Depends on Items (5.1), Inventory Tracking (5.4), GL/Accounts (future).

---

### 5.6 Inventory Valuation & COGS Auto-Journaling

- **Purpose:** Automatically compute Cost of Goods Sold on each sale and post the corresponding GL journal, keeping inventory asset and P&L accurate in real time.

- **Zoho Books behaviour [Books]:**
  - Method: **FIFO** exclusively in Books. `stock that comes in first gets sold out in the same order`.
  - COGS is calculated from actual **bill purchase rates** (not the item's `purchase_rate` field) — the real bill line cost drives COGS.
  - Example: Opening stock 10 units @ $100; next bill 20 units @ $150; sell 14 → COGS = (10×$100) + (4×$150) = $1,600.
  - Journal on invoice confirm: `Dr Cost of Goods Sold (COGS account) / Cr Inventory Asset`.
  - Journal on bill confirm: `Dr Inventory Asset / Cr Accounts Payable`.
  - Journal on invoice void: reversal of above (Cr COGS / Dr Inventory Asset).
  - Inventory Valuation Summary report: total stock value per item = qty × weighted avg rate (for display, even in FIFO orgs).
  - Inventory Revaluation: ad-hoc value adjustment (see 5.5) posts to Inventory Revaluation account.
  - ABC Classification report groups items A/B/C by revenue contribution.

- **Data model:**
  ```
  cogs_lots                                -- FIFO lot ledger (source of truth for COGS computation)
    id              int autoincrement PK
    org_id          int not null
    item_id         int not null
    lot_date        timestamp not null     -- date lot entered inventory (bill date / adjustment date)
    reference_type  varchar(50)            -- 'bill'|'adjustment'|'opening'|'assembly'
    reference_id    int
    original_qty    decimal(15,4) not null
    remaining_qty   decimal(15,4) not null -- decremented as sold
    unit_cost       decimal(15,6) not null
    created_at      timestamp
    hash            varchar(64)

  gl_journals                              -- auto-posted journal entries (referenced by other modules too)
    id              int autoincrement PK
    org_id          int not null
    journal_date    timestamp not null
    reference_type  varchar(50)
    reference_id    int
    description     text
    status          enum('posted','voided') default 'posted'
    created_at      timestamp
    hash            varchar(64)

  gl_journal_lines
    id              int autoincrement PK
    journal_id      int not null
    account_id      int not null
    debit           decimal(15,2) not null default 0.00
    credit          decimal(15,2) not null default 0.00
    description     text
    item_id         int                    -- for COGS lines, link back to item
    sort_order      int
  ```

- **API (contract-first):**
  ```
  GET    /api/reports/inventory-valuation  Valuation summary: item × qty_on_hand × avg_cost × total_value
  GET    /api/reports/fifo-lots            FIFO lot tracking: item × lots with remaining qty and cost
  GET    /api/reports/cogs                 COGS by period; filter: date_from, date_to, item_id
  GET    /api/reports/inventory-abc        ABC classification by revenue; filter: period
  GET    /api/items/:id/valuation          Single item valuation detail with lot breakdown
  POST   /api/inventory/revalue            Trigger bulk revaluation job (async) for average-cost orgs
  ```
  COGS journals are auto-posted by the invoice-confirm handler — no separate public endpoint for posting COGS.

- **Workflow / state machine:**
  ```
  Bill confirmed:
    → cogs_lots INSERT (new lot: reference_id=bill_id, remaining_qty=bill_qty, unit_cost=bill_line_rate)
    → stock_summary.fifo_layers updated
    → gl_journal posted: Dr Inventory Asset / Cr AP

  Invoice confirmed (for each inventory line item):
    → FIFO dequeue: consume lots oldest-first until qty satisfied
    → cogs_lots UPDATE remaining_qty for each consumed lot
    → stock_movements INSERT (type=sale)
    → gl_journal posted: Dr COGS / Cr Inventory Asset (at lot cost, not selling price)

  Invoice voided:
    → Reversal lots: re-add consumed qty back to fifo_layers (insert reverse lot or restore remaining_qty)
    → Reversal gl_journal posted
  ```
  Average cost variant: no lot tracking — `stock_summary.avg_cost` recalculated as weighted moving average on each purchase; used uniformly for COGS.

- **Automations:**
  - Nightly `fifo_integrity_check` job: recomputes expected `stock_on_hand` from `cogs_lots` and reconciles against `stock_summary`; alerts on discrepancy.
  - Valuation recompute job: triggered on lot amendment or bulk lot import.
  - Auto-GL: COGS journal is synchronous within the invoice-confirm transaction (same DB transaction: invoice status update + stock movement + journal lines).
  - Valuation method change (FIFO ↔ average): blocked mid-year; only permitted at financial year start with full lot recalculation.

- **Personalized / better-than-Zoho:**
  - Weighted-average costing supported alongside FIFO (switchable at org level per financial year).
  - FIFO lot viewer: `GET /api/items/:id/fifo-lots` exposes full lot stack with drill-down to source bill — Zoho's FIFO Cost Lot Tracking report is read-only and not API-accessible in Books.
  - COGS journal lines linked back to invoice line items — enabling per-product gross margin in real time.
  - Tamper-evident: `cogs_lots` and `gl_journals` are hash-chained; any backdated tampering produces chain break detected by integrity job.

- **Build status:** New. Critical dependency for Sales Invoices and Purchase Bills. Must be designed before those modules.

---

### 5.7 Price Lists (Percentage, Per-Item, Volume/Quantity Brackets, Multi-Currency)

- **Purpose:** Override standard item rates for specific customers, vendors, currencies, or quantity tiers — applied automatically to transactions.

- **Zoho Books behaviour [Books]:**
  - **Types:** `sales` (for customers) or `purchases` (for vendors).
  - **Pricing methods:**
    1. `fixed_percentage`: markup (increase) or markdown (decrease) of standard rate by a %.
    2. `per_item`: individual rate specified per item.
    3. `volume` (Inventory-tier): quantity-based brackets — different unit price per qty range; up to 10 brackets per item; defaults to standard rate if qty falls outside brackets.
  - Currency: price list can be denominated in a foreign currency (customer's local currency); rate conversion handled at transaction time.
  - Assignment: price list linked to a contact (customer/vendor) — auto-applied to all their transactions. Also overridable per transaction or per line item.
  - Rounding: configurable rounding on percentage-based lists.
  - Deletion of a price list does not retroactively affect past transactions.
  - Export/import via CSV/TSV/XLS (max 1 MB).
  - Inactivation supported (inactive lists cannot be applied to new transactions).
  - Can generate barcode labels with prices from a selected price list.

- **Data model:**
  ```
  price_lists
    id              int autoincrement PK
    org_id          int not null
    name            varchar(100) not null
    list_type       enum('sales','purchase') not null
    pricing_scheme  enum('fixed_percentage','per_item','volume') not null
    currency_id     int                     -- null = org default currency
    percentage      decimal(6,3)            -- for fixed_percentage: positive=markup, negative=markdown
    rounding        enum('none','round_off','round_up','round_down') default 'none'
    status          enum('active','inactive') default 'active'
    created_at      timestamp
    updated_at      timestamp
    hash            varchar(64)

  price_list_items                         -- for per_item and volume schemes
    id              int autoincrement PK
    price_list_id   int not null
    item_id         int not null

    -- per_item:
    custom_rate     decimal(15,2)           -- null if volume scheme

    -- volume: stored as JSON brackets array
    volume_brackets json
    -- e.g. [{"min_qty":1,"max_qty":10,"rate":15.00},{"min_qty":11,"max_qty":null,"rate":13.00}]

    created_at      timestamp

  contact_price_lists                      -- which price list is default for a contact
    contact_id      int not null
    price_list_id   int not null
    PRIMARY KEY (contact_id, price_list_id)
  ```

- **API (contract-first):**
  ```
  POST   /api/price-lists                       Create → mutate then SELECT
  GET    /api/price-lists                       List; filter: list_type, status, currency_id
  GET    /api/price-lists/:id                   Get with all item rates
  PUT    /api/price-lists/:id                   Update → mutate then SELECT
  DELETE /api/price-lists/:id                   Soft-delete (set inactive if used; hard-delete if unused)
  POST   /api/price-lists/:id/activate
  POST   /api/price-lists/:id/deactivate
  PUT    /api/price-lists/:id/items             Bulk upsert per-item rates or volume brackets
  DELETE /api/price-lists/:id/items/:item_id    Remove item override from list

  -- Resolution endpoint (used by transaction line-item entry):
  POST   /api/price-lists/resolve               Body: { price_list_id, item_id, quantity, currency_id }
                                                Returns: { resolved_rate, applied_bracket?, currency_rate }

  -- Contact assignment:
  PUT    /api/contacts/:id/price-list           Assign default price list to contact
  GET    /api/contacts/:id/price-list           Get assigned price list
  ```

- **Workflow / state machine:**
  ```
  Price list active → assigned to contact → transaction created:
    1. Fetch contact's default price_list_id
    2. Call resolve engine: fixed_percentage → apply % to item.rate; per_item → fetch custom_rate; volume → match qty bracket
    3. Apply currency conversion if price list currency ≠ transaction currency
    4. Line item rate set; user can override (stores both original_rate and applied_rate)
  Price list inactivated → no new transactions use it; historical transactions unaffected
  ```

- **Automations:**
  - `price_list.expiry` (future feature hook): optional `valid_from`/`valid_until` dates; expired lists auto-deactivate via scheduled job.
  - Contact-level notification when their assigned price list is deactivated.
  - Webhook: `price_list.updated` — notify downstream integrations (e.g. e-commerce sync).

- **Personalized / better-than-Zoho:**
  - Volume pricing available at Books-tier (not gated behind Inventory add-on as in Zoho).
  - `valid_from` / `valid_until` date-bounded price lists (time-limited promotions) — Zoho has no native date gating.
  - `resolve` endpoint lets the frontend compute the applicable rate without creating a transaction — enables real-time price previews.
  - Price list comparison report: `GET /api/reports/price-list-comparison?item_id=X` shows item rate across all active price lists side by side.
  - Margin guard: org setting `min_margin_pct`; resolve engine returns warning if resolved rate yields margin below threshold.

- **Build status:** New. Depends on Items (5.1). Required before Sales Orders / Invoices (rate resolution at line-item entry).

---

### 5.8 Item Images & Custom Fields

- **Purpose:** Attach visual assets to items and extend the item schema with org-specific metadata without schema migrations.

- **Zoho Books behaviour [Books]:**
  - Single image per item (Zoho Books); Zoho Inventory supports multiple images.
  - Custom fields: configurable per org in Settings → Items → Fields. Data types: text, number, date, dropdown, checkbox, URL, multi-line text.
  - Custom fields appear on item detail and can be included in transaction line items.
  - Record locking: items can be locked after reaching a status to prevent unauthorized changes.
  - Custom action buttons via Deluge scripts or external URLs.

- **Data model:**
  ```
  item_images
    id            int autoincrement PK
    item_id       int not null
    url           text not null             -- CDN/object-storage URL
    alt_text      varchar(255)
    sort_order    int default 0
    is_primary    tinyint(1) default 0
    created_at    timestamp

  item_custom_field_definitions
    id              int autoincrement PK
    org_id          int not null
    field_name      varchar(100) not null
    field_key       varchar(100) not null    -- slug used in JSON storage
    data_type       enum('text','number','date','dropdown','checkbox','url','textarea') not null
    dropdown_options json                    -- for dropdown type
    is_required     tinyint(1) default 0
    show_on_transaction tinyint(1) default 0
    sort_order      int default 0
    created_at      timestamp
  ```
  Custom field values are stored in `items.custom_fields` JSON column (key=`field_key`, value=typed value). No separate EAV table needed for MVP.

- **API (contract-first):**
  ```
  POST   /api/items/:id/images              Upload image (multipart) → store to object storage → mutate then SELECT
  GET    /api/items/:id/images              List images
  PUT    /api/items/:id/images/:img_id      Update alt text / sort order / primary flag
  DELETE /api/items/:id/images/:img_id      Delete image

  POST   /api/settings/item-custom-fields   Create field definition
  GET    /api/settings/item-custom-fields   List definitions for org
  PUT    /api/settings/item-custom-fields/:id  Update definition
  DELETE /api/settings/item-custom-fields/:id  Delete (scrubs field from all item JSON)
  ```

- **Workflow / state machine:**
  Image upload: multipart POST → validate (type: jpg/png/webp, max 5 MB) → resize/optimise (sharp) → upload to S3-compatible store → insert `item_images` row → return CDN URL.

- **Automations:**
  - On custom field definition delete: background job iterates `items.custom_fields` and removes the key (async, progress logged).
  - Image CDN URL signed-URL refresh job for private-bucket configurations.

- **Personalized / better-than-Zoho:**
  - Multiple images per item at Books-tier (Zoho Books: one image only).
  - Primary image flag + sort order for gallery display.
  - `show_on_transaction` flag per custom field — fields visible in invoice/PO line items (Zoho requires manual configuration in each transaction template).

- **Build status:** New. Depends on Items (5.1). Images require object storage (S3 / Cloudflare R2) infrastructure.

---

### 5.9 Warehouses & Stock Transfers *(Inventory-tier — flag)*

- **Purpose:** Track stock at multiple physical locations and move inventory between them via transfer orders.

- **Zoho Books behaviour [Inventory-tier only]:**
  - Multiple warehouses: each is a named physical location; stock tracked per item per warehouse.
  - Transfer Order: document recording stock movement from source warehouse to destination. Status: `Draft → In Transit → Received`.
  - `Transfer and Receive` option completes the transfer instantly (same-day, internal move).
  - One-to-one transfers only (source → one destination); transferring to multiple warehouses requires separate orders.
  - Warehouse stock visible on item detail (`locations[]` array in API).
  - Zoho Books (without Inventory add-on): shows location-level stock but does not manage transfers.
  - Replenishment module: identifies items at reorder level per warehouse and suggests transfer or purchase.

- **Data model:**
  ```
  warehouses
    id            int autoincrement PK
    org_id        int not null
    name          varchar(100) not null
    address       json
    is_primary    tinyint(1) default 0
    status        enum('active','inactive') default 'active'
    created_at    timestamp

  warehouse_stock
    id            int autoincrement PK
    warehouse_id  int not null
    item_id       int not null
    stock_on_hand decimal(15,4) not null default 0.0000
    committed     decimal(15,4) not null default 0.0000
    last_updated  timestamp
    UNIQUE KEY (warehouse_id, item_id)

  transfer_orders
    id              int autoincrement PK
    org_id          int not null
    transfer_number varchar(50)
    from_warehouse  int not null
    to_warehouse    int not null
    transfer_date   timestamp
    status          enum('draft','in_transit','received','cancelled') not null default 'draft'
    notes           text
    created_by      int
    created_at      timestamp
    updated_at      timestamp
    hash            varchar(64)

  transfer_order_lines
    id                int autoincrement PK
    transfer_order_id int not null
    item_id           int not null
    quantity          decimal(15,4) not null
    received_qty      decimal(15,4) default 0.0000
    unit_cost         decimal(15,6)
  ```

- **API (contract-first):**
  ```
  POST   /api/warehouses                          Create warehouse → mutate then SELECT
  GET    /api/warehouses                          List
  GET    /api/warehouses/:id                      Get with stock summary
  PUT    /api/warehouses/:id                      Update
  GET    /api/warehouses/:id/stock                Stock per item at this warehouse

  POST   /api/transfer-orders                     Create draft → mutate then SELECT
  GET    /api/transfer-orders                     List; filter: status, from_warehouse, to_warehouse, date_from
  GET    /api/transfer-orders/:id                 Get with lines
  PUT    /api/transfer-orders/:id                 Update draft
  POST   /api/transfer-orders/:id/initiate        Draft → In Transit (deduct from_warehouse stock)
  POST   /api/transfer-orders/:id/receive         In Transit → Received (add to_warehouse stock); partial receipt supported
  POST   /api/transfer-orders/:id/cancel          Cancel (reverse if already in transit)
  ```

- **Workflow / state machine:**
  ```
  Draft → In Transit:
    warehouse_stock[from_warehouse][item] -= qty
    stock_movements INSERT (type=transfer_out, warehouse_id=from_warehouse)

  In Transit → Received:
    warehouse_stock[to_warehouse][item] += received_qty
    stock_movements INSERT (type=transfer_in, warehouse_id=to_warehouse)
    If received_qty < ordered_qty: partial receipt; order stays In Transit until fully received

  Cancellation (In Transit): reversal movement posted
  ```
  No GL impact for internal transfers (inventory asset stays same org). If inter-company: GL entries required (future).

- **Automations:**
  - Replenishment suggestion: `GET /api/warehouses/:id/replenishment-suggestions` returns items below reorder level at that warehouse with recommended transfer qty from primary warehouse or PO suggestion.
  - In-transit alert: transfer orders in `in_transit` > N days trigger manager notification.
  - Audit ledger on every state transition.

- **Personalized / better-than-Zoho:**
  - Partial receipts (Zoho Inventory supports, but Zoho Books add-on does not expose granularly via API).
  - Multi-warehouse demand forecasting: `GET /api/warehouses/:id/stock-forecast?days=30` — per-warehouse sales velocity + current stock → days-of-stock remaining.
  - Barcode-driven receiving: `POST /api/transfer-orders/:id/receive-by-barcode` accepts scanned item SKU + qty for mobile-friendly warehouse ops.

- **Build status:** New (Inventory-tier feature, but implementing natively). Depends on Items (5.1), Inventory Tracking (5.4). `warehouse_id` is an optional field on `stock_movements` — single-warehouse orgs leave it null.

---

### 5.10 Inventory Reports

- **Purpose:** Visibility into stock health, valuation, movement history, and item performance for operational and accounting decisions.

- **Zoho Books behaviour [Books]:**
  1. **Inventory Summary:** item-level view of `stock_on_hand`, `committed_stock`, `available_for_sale`, `stock_on_order`; drills into movement sources (POs, Bills, Invoices, Sales Orders).
  2. **Inventory Valuation Summary:** total value per item = qty × effective unit cost; drill-down to opening/closing stock changes in a period.
  3. **FIFO Cost Lot Tracking:** shows inflow lots (vendor purchases) and outflow lots (customer sales) in FIFO order; per-lot cost and remaining quantity.
  4. **ABC Classification:** segments items into A (top revenue drivers), B (mid-tier), C (low-revenue) — configurable revenue thresholds.
  5. **Inventory Adjustment Summary:** net adjustments per item per period grouped by date or reason.
  6. **Inventory Adjustment Details:** every individual adjustment line with reason, status, qty delta, value delta.
  - All reports: date range filters, column selection, export (PDF/XLS/CSV), share with user at permission level.

- **Data model:** All reports are computed queries over `stock_movements`, `cogs_lots`, `stock_summary`, `inventory_adjustments`, `inventory_adjustment_lines`, `items`. No separate report table needed for MVP; materialized views or scheduled aggregation tables for performance at scale.

  ```
  -- Optional materialized aggregate for ABC report (rebuild nightly):
  item_abc_cache
    id          int autoincrement PK
    org_id      int not null
    item_id     int not null
    period      date
    revenue     decimal(15,2)
    pct_revenue decimal(6,3)
    abc_class   enum('A','B','C')
    created_at  timestamp
  ```

- **API (contract-first):**
  ```
  GET    /api/reports/inventory/summary          Inventory Summary; filter: item_id, warehouse_id, page, limit
  GET    /api/reports/inventory/valuation        Valuation Summary; filter: as_of_date, item_id
  GET    /api/reports/inventory/fifo-lots        FIFO Lot Tracking; filter: item_id, date_from, date_to
  GET    /api/reports/inventory/abc              ABC Classification; filter: period_from, period_to, class
  GET    /api/reports/inventory/adjustments      Adjustment Summary; filter: date_from, date_to, item_id, type
  GET    /api/reports/inventory/adjustment-details  Adjustment Details (paginated); same filters
  GET    /api/reports/inventory/low-stock        Items at or below reorder level; filter: warehouse_id
  GET    /api/reports/inventory/movement-history Movement ledger for one item; filter: item_id (required), date range
  ```
  All report endpoints: `format=json|csv|xlsx` query param for export; JSON default for UI rendering.

- **Workflow / state machine:** Reports are read-only — no state. Nightly materialized jobs for ABC cache and valuation snapshots if org item count > threshold (configurable, default 5,000 items).

- **Automations:**
  - Nightly email digest: low-stock report sent to configured recipients if any items are below reorder level.
  - ABC class change notification: item moves from A to B or B to C triggers alert (demand degradation signal).
  - Scheduled export: `GET /api/reports/inventory/valuation?format=xlsx` can be scheduled as a recurring webhook delivery.

- **Personalized / better-than-Zoho:**
  - All 8 report endpoints are fully API-queryable with JSON responses — Zoho Books reports are UI-only; the API exposes only summary data.
  - Demand forecast embedded in Inventory Summary (`avg_daily_sales`, `days_of_stock_remaining`) — Zoho has no forecast column.
  - Movement history linked to audit ledger: each movement row carries `hash` provable in the hash chain — enables forensic stock audits.
  - Gross margin column in Inventory Valuation (selling price − COGS cost) per item, per period — Zoho does not cross-reference pricing and valuation in one report.

- **Build status:** New. Depends on all prior sub-features (5.1–5.9). Reports query live tables; no separate reporting DB needed for MVP. Add read replicas or `item_abc_cache` materialized table as scale requires.

---

## Cross-Cutting Notes for This Section

| Concern | Decision |
|---|---|
| PK strategy | `int autoincrement` on all tables |
| Money precision | `decimal(15,2)` for currency amounts; `decimal(15,6)` for unit costs (avoid rounding in FIFO lots); `decimal(15,4)` for quantities |
| No RETURNING | All inserts: `INSERT` → `SELECT WHERE id = LAST_INSERT_ID()`. All updates: `UPDATE` → `SELECT WHERE id = :id` |
| No FKs | All cross-table references are soft (int columns). Integrity enforced at application layer + nightly reconciliation jobs |
| Audit ledger | Every table that changes financial state (`items`, `stock_movements`, `cogs_lots`, `gl_journals`, `inventory_adjustments`, `transfer_orders`) has a `hash varchar(64)` column fed into the tamper-evident hash chain |
| Valuation method | Org-level setting (`fifo` or `average`). FIFO = `cogs_lots` dequeue. Average = `stock_summary.avg_cost` rolling weighted average |
| Negative stock | Blocked by default; configurable per org |
| Zoho Inventory features | Implemented natively (not as add-on dependency): composite items, multi-warehouse, transfer orders, volume pricing, weighted-average costing |
| Drizzle schema | All tables defined in `drizzle-orm/mysql2` schema files under `db/schema/items/`; custom `json` type wrapper for JSON columns; `decimal` mapped to string in Drizzle (parse at service layer) |
| OpenAPI + Orval | All endpoints spec'd in `openapi/items.yaml`; Orval generates TanStack Query hooks + Zod validators; response types enforced at compile time |


---


> **Zoho Books → Astram Financial Portal: Feature Blueprint**
> Stack: OpenAPI 3.1 → Orval → TanStack Query + Zod | Drizzle (drizzle-orm/mysql2) on MariaDB | Express 5 `/api` | React 19 + Vite + wouter + shadcn/ui

---

## 6. Taxes & Compliance

### Overview

Taxes & Compliance is the most region-divergent module in any financial portal. Zoho Books handles this by shipping separate region-editions (IN, UK, US, AE, SA, AU, CA…) with different tax engines per edition. The Astram approach is better: a **pluggable, region-configurable tax-engine architecture** where each tax jurisdiction is a first-class plugin mounted at runtime based on the organisation's `region` setting.

**Pluggable tax-engine architecture (recommended)**

```
TaxEngine interface
  ├── calculateTax(lineItems, context) → TaxBreakdown[]
  ├── validateRegistration(regNumber) → ValidationResult
  ├── generateReturn(period) → ReturnDraft
  └── submitReturn(draft) → SubmissionResult

Plugins (one per jurisdiction family):
  ├── IndiaGSTEngine      — CGST/SGST/IGST/Cess, IRN/IRP, e-way bill, GSTN API
  ├── UKVATEngine         — MTD HMRC, reverse charge, flat-rate, OSS/MOSS
  ├── EUVATEngine         — OSS/IOSS, reverse charge, place-of-supply rules
  ├── GCCVATEngine        — UAE FTA / KSA ZATCA Phase 2, Fatoorah API
  ├── USSalesTaxEngine    — Avalara AvaTax or built-in nexus + TaxJar
  └── WithholdingEngine   — TDS/TCS India (Section 393/394 ITA 2025)
```

Every engine implements the same `TaxEngine` interface. Swapping or adding regions requires no core-code changes.

**Sub-features covered:**

1. Tax Rates & Tax Groups
2. Tax Authorities / Agencies
3. GST — India (GSTIN, HSN/SAC, GSTR-1/3B/9, e-Invoicing/IRN, e-way bill, reverse charge, GSTR-2B reconciliation)
4. VAT — UK (MTD/HMRC, reverse charge, flat-rate, Domestic Reverse Charge)
5. VAT — EU (OSS/IOSS, MOSS legacy, place-of-supply, reverse charge)
6. VAT — GCC (UAE FTA, KSA ZATCA Phase 2/Fatoorah)
7. US Sales Tax (nexus, multi-jurisdiction, Avalara integration, exemptions)
8. TDS / TCS — India (ITA 2025, Section 393/394, withholding on transactions)
9. Digital Tax / VAT MOSS / OSS (cross-region digital services)
10. Tax Exemptions (customer-level, item-level, certificate management)
11. Multi-Tax on Line Items (compound tax, cascading, tax groups)
12. Tax Reports & Filing / Returns
13. Tax Payments & Liability Tracking

---

### 6.1 Tax Rates & Tax Groups

- **Purpose:** Define the atomic tax rates and composite groups applied to every transactional line item.

- **Zoho Books behaviour:**
  - Flat rates (`tax_type: "tax"`) and compound taxes (`tax_type: "compound_tax"`) where the second tax is levied on (subtotal + first tax).
  - Tax groups bundle two or more rates into a single selectable object (e.g. 18% GST = 9% CGST + 9% SGST; US federal + state + county).
  - India edition auto-populates GST slabs (0%, 5%, 12%, 18%, 28%) with CGST/SGST/IGST splits and Cess.
  - `tax_specific_type` per region: `igst | cgst | sgst | cess | nil` (India); `ISR | IVA | IEPS` (Mexico); standard/reduced/zero (EU/UK).
  - Rates can have start/end dates (used for ITA 2025 TDS/TCS transition April 1 2026).
  - Import/export of rate tables; mark inactive without deletion.

- **Data model:**
  ```ts
  // drizzle schema (mysql2)
  export const taxRates = mysqlTable("tax_rates", {
    id:             int("id").autoincrement().primaryKey(),
    orgId:          int("org_id").notNull(),
    name:           text("name").notNull(),
    code:           text("code"),                        // e.g. "GST18", "VAT20"
    rate:           decimal("rate", { precision: 8, scale: 4 }).notNull(),
    taxType:        text("tax_type").notNull(),           // "simple" | "compound"
    specificType:   text("specific_type"),               // "cgst"|"sgst"|"igst"|"cess"|"vat"|"sales_tax"…
    region:         text("region").notNull(),            // "IN"|"UK"|"EU"|"AE"|"SA"|"US"…
    taxAuthorityId: int("tax_authority_id"),
    compoundOnId:   int("compound_on_id"),               // FK-style, points to base rate id
    effectiveFrom:  timestamp("effective_from"),
    effectiveTo:    timestamp("effective_to"),
    isActive:       int("is_active").notNull().default(1),
    metadata:       json("metadata"),                    // slab details, HSN applicability, etc.
    createdAt:      timestamp("created_at").defaultNow(),
    updatedAt:      timestamp("updated_at").defaultNow().onUpdateNow(),
  });

  export const taxGroups = mysqlTable("tax_groups", {
    id:         int("id").autoincrement().primaryKey(),
    orgId:      int("org_id").notNull(),
    name:       text("name").notNull(),
    region:     text("region").notNull(),
    isActive:   int("is_active").notNull().default(1),
    createdAt:  timestamp("created_at").defaultNow(),
  });

  export const taxGroupItems = mysqlTable("tax_group_items", {
    id:         int("id").autoincrement().primaryKey(),
    taxGroupId: int("tax_group_id").notNull(),
    taxRateId:  int("tax_rate_id").notNull(),
    sortOrder:  int("sort_order").notNull().default(0),
  });
  ```

- **API (contract-first):**
  ```yaml
  GET    /api/tax-rates                 # list; ?region=IN&is_active=1&effective_date=2026-04-01
  POST   /api/tax-rates                 # create; mutate → SELECT last insert; returns created rate
  GET    /api/tax-rates/:id
  PUT    /api/tax-rates/:id             # mutate → SELECT; returns updated
  DELETE /api/tax-rates/:id             # soft-delete (is_active=0)

  GET    /api/tax-groups                # list; ?region=IN
  POST   /api/tax-groups                # { name, region, rateIds: number[] }
  GET    /api/tax-groups/:id
  PUT    /api/tax-groups/:id
  DELETE /api/tax-groups/:id

  POST   /api/tax-rates/import          # CSV/JSON bulk import
  GET    /api/tax-rates/export          # CSV download
  ```
  MySQL has no `RETURNING` — every mutation does `INSERT/UPDATE` then `SELECT` by `id`/`last_insert_id()`.

- **Workflow / state machine:** Rates are versioned via `effectiveFrom`/`effectiveTo`. Tax engine always resolves the active rate at `transaction_date`. Rate edits create new rows; old rows get `effectiveTo` stamped — no destructive updates to historical data.

- **Automations:**
  - On organisation region change, seed default rates for the new region.
  - Scheduled job checks for official rate-table updates (e.g. GST council notifications via webhook) and flags rates for review.
  - On April 1, 2026 (ITA 2025 enforcement), auto-transition TDS/TCS section numbers and rates.

- **Personalized / better-than-Zoho:**
  - Rate versioning with full history (Zoho overwrites); audit-ledger entry on every rate change.
  - AI-assisted rate suggestion: when a new item is created, suggest tax rate from description embedding match against HSN/SAC corpus.
  - GraphQL-friendly flat representation for multi-region dashboards.

- **Build status:** New.

---

### 6.2 Tax Authorities / Agencies

- **Purpose:** Model the government bodies to which tax is remitted; link rates and filing periods to the correct authority.

- **Zoho Books behaviour:**
  - US/Canada editions support tax authorities (CDTFA, Department of Revenue, etc.) linked to tax rates.
  - Each authority has a filing frequency (monthly/quarterly/annual) and a remittance account.
  - India: implicit — GSTN is the single authority; TDS goes to Income Tax Department.
  - UK: HMRC is the single VAT authority.
  - GCC: UAE FTA / KSA ZATCA.

- **Data model:**
  ```ts
  export const taxAuthorities = mysqlTable("tax_authorities", {
    id:              int("id").autoincrement().primaryKey(),
    orgId:           int("org_id").notNull(),
    name:            text("name").notNull(),              // "HMRC" | "GSTN" | "ZATCA" | "FTA"
    region:          text("region").notNull(),
    authorityType:   text("authority_type").notNull(),    // "vat"|"gst"|"sales_tax"|"withholding"|"corporate"
    registrationNo:  text("registration_no"),
    filingFrequency: text("filing_frequency").notNull(), // "monthly"|"quarterly"|"annual"
    filingDueDay:    int("filing_due_day"),               // day-of-month
    remittanceAccId: int("remittance_acc_id"),            // chart-of-accounts id
    apiCredentials:  json("api_credentials"),             // encrypted; GSP/HMRC/ZATCA tokens
    contactEmail:    text("contact_email"),
    website:         text("website"),
    isActive:        int("is_active").notNull().default(1),
    createdAt:       timestamp("created_at").defaultNow(),
    updatedAt:       timestamp("updated_at").defaultNow().onUpdateNow(),
  });
  ```

- **API (contract-first):**
  ```yaml
  GET    /api/tax-authorities           # ?region=IN&type=gst
  POST   /api/tax-authorities
  GET    /api/tax-authorities/:id
  PUT    /api/tax-authorities/:id
  DELETE /api/tax-authorities/:id       # soft-delete
  POST   /api/tax-authorities/:id/test-connection   # ping authority API
  ```

- **Workflow / state machine:** Authority → has many filing periods → each period transitions: `open → prepared → submitted → acknowledged → paid`.

- **Automations:** Filing reminders N days before due date; webhook push to notify accountants; auto-create filing period records on calendar roll-over.

- **Personalized / better-than-Zoho:** Unified authority registry across all regions (Zoho siloes by edition). Authority-level API health dashboard. Encrypted credential vault with rotation alerts.

- **Build status:** New.

---

### 6.3 GST — India

- **Purpose:** Full Indian GST compliance: GSTIN validation, HSN/SAC classification, CGST/SGST/IGST calculation, GSTR-1/3B/9 filing via GSTN API, e-invoicing/IRN via IRP, e-way bills, reverse charge, GSTR-2B reconciliation.

- **Zoho Books behaviour:**
  - Zoho is a registered **GST Suvidha Provider (GSP)** — files returns directly via GSTN API without leaving the app.
  - GSTIN captured on org profile + per contact; validated against GSTN lookup.
  - HSN codes: 4-digit for turnover < ₹5 Cr; 6-digit for ≥ ₹5 Cr. SAC codes 6-digit mandatory for all services.
  - Auto-selects CGST+SGST (intra-state) or IGST (inter-state) based on supplier/recipient GSTIN state code.
  - GST slabs pre-seeded: 0%, 5%, 12%, 18%, 28% + Cess.
  - GSTR-1: monthly (due 11th) or quarterly IFF; lists all outward supplies.
  - GSTR-3B: monthly summary, ITC, and net payable (due 20th); user pulls data → reviews → files.
  - GSTR-2B: system-generated ITC statement; reconcile purchase register against GSTN GSTR-2B data (matched / partially matched / missing).
  - GSTR-9: annual return.
  - **e-Invoicing/IRN**: B2B invoices above ₹5 Cr turnover threshold auto-generate IRN + QR code via IRP (Invoice Registration Portal) API. Invalid HSN = no IRN = non-compliant invoice.
  - **e-Way Bill**: required for goods movement > ₹50,000; generated from delivery challan or invoice via e-way bill portal API.
  - **Reverse Charge Mechanism (RCM)**: on specific notified supplies (GTA, legal services, import of services); buyer self-assesses and pays GST.
  - **GST TDS**: applicable when government/notified entity deducts 2% GST TDS from payment; tracked separately from Income TDS.
  - Document types: Tax Invoice, Bill of Supply, Export Invoice (with/without IGST), Credit Note, Debit Note, Delivery Challan.
  - Invoice Management System (IMS) for tracking submitted invoices.

- **Data model:**
  ```ts
  export const gstRegistrations = mysqlTable("gst_registrations", {
    id:             int("id").autoincrement().primaryKey(),
    orgId:          int("org_id").notNull(),
    gstin:          text("gstin").notNull(),              // 15-char alphanumeric
    legalName:      text("legal_name").notNull(),
    tradeName:      text("trade_name"),
    state:          text("state").notNull(),              // 2-char state code
    regType:        text("reg_type").notNull(),           // "regular"|"composition"|"unregistered"
    turnoverSlabCr: decimal("turnover_slab_cr", { precision: 10, scale: 2 }), // for HSN digit requirement
    einvoiceEnabled: int("einvoice_enabled").notNull().default(0),
    ewayBillEnabled: int("eway_bill_enabled").notNull().default(0),
    gspCredentials: json("gsp_credentials"),             // encrypted GSTN/GSP token
    irpCredentials: json("irp_credentials"),             // encrypted IRP token
    createdAt:      timestamp("created_at").defaultNow(),
    updatedAt:      timestamp("updated_at").defaultNow().onUpdateNow(),
  });

  export const hsnSacCodes = mysqlTable("hsn_sac_codes", {
    id:          int("id").autoincrement().primaryKey(),
    code:        text("code").notNull(),                 // 4/6/8 digit
    codeType:    text("code_type").notNull(),            // "hsn"|"sac"
    description: text("description").notNull(),
    gstRate:     decimal("gst_rate", { precision: 6, scale: 2 }).notNull(),
    chapter:     text("chapter"),
    isActive:    int("is_active").notNull().default(1),
    updatedAt:   timestamp("updated_at").defaultNow().onUpdateNow(),
  });

  export const gstReturns = mysqlTable("gst_returns", {
    id:             int("id").autoincrement().primaryKey(),
    orgId:          int("org_id").notNull(),
    returnType:     text("return_type").notNull(),       // "GSTR-1"|"GSTR-3B"|"GSTR-9"|"GSTR-2B"
    periodMonth:    int("period_month").notNull(),       // 1–12
    periodYear:     int("period_year").notNull(),
    status:         text("status").notNull().default("open"), // open|prepared|filed|acknowledged|amended
    taxableAmount:  decimal("taxable_amount", { precision: 18, scale: 2 }),
    cgst:           decimal("cgst", { precision: 18, scale: 2 }),
    sgst:           decimal("sgst", { precision: 18, scale: 2 }),
    igst:           decimal("igst", { precision: 18, scale: 2 }),
    cess:           decimal("cess", { precision: 18, scale: 2 }),
    itcClaimed:     decimal("itc_claimed", { precision: 18, scale: 2 }),
    netPayable:     decimal("net_payable", { precision: 18, scale: 2 }),
    filedAt:        timestamp("filed_at"),
    arn:            text("arn"),                        // Acknowledgement Reference Number
    payload:        json("payload"),                    // full GSTN API request/response
    auditHash:      text("audit_hash").notNull(),       // tamper-evident chain
    createdAt:      timestamp("created_at").defaultNow(),
    updatedAt:      timestamp("updated_at").defaultNow().onUpdateNow(),
  });

  export const einvoices = mysqlTable("einvoices", {
    id:           int("id").autoincrement().primaryKey(),
    orgId:        int("org_id").notNull(),
    invoiceId:    int("invoice_id").notNull(),
    irn:          text("irn"),                          // 64-char hash
    ackNo:        text("ack_no"),
    ackDate:      timestamp("ack_date"),
    qrCode:       text("qr_code"),                     // base64 QR
    signedInvoice: text("signed_invoice"),             // IRP-signed JSON/XML
    status:       text("status").notNull().default("pending"), // pending|generated|cancelled
    cancelReason: text("cancel_reason"),
    cancelledAt:  timestamp("cancelled_at"),
    payload:      json("payload"),
    createdAt:    timestamp("created_at").defaultNow(),
  });

  export const ewayBills = mysqlTable("eway_bills", {
    id:            int("id").autoincrement().primaryKey(),
    orgId:         int("org_id").notNull(),
    documentId:    int("document_id").notNull(),       // invoice/challan id
    documentType:  text("document_type").notNull(),   // "invoice"|"challan"
    ewaybillNo:    text("ewaybill_no"),
    generatedAt:   timestamp("generated_at"),
    validUpto:     timestamp("valid_upto"),
    vehicleNo:     text("vehicle_no"),
    transMode:     text("trans_mode"),                // "1"=road "2"=rail etc.
    distance:      int("distance"),
    status:        text("status").notNull().default("pending"),
    payload:       json("payload"),
    createdAt:     timestamp("created_at").defaultNow(),
  });

  export const gstr2bReconciliation = mysqlTable("gstr2b_reconciliation", {
    id:            int("id").autoincrement().primaryKey(),
    orgId:         int("org_id").notNull(),
    periodMonth:   int("period_month").notNull(),
    periodYear:    int("period_year").notNull(),
    billId:        int("bill_id"),
    vendorGstin:   text("vendor_gstin"),
    invoiceNo:     text("invoice_no"),
    invoiceDate:   timestamp("invoice_date"),
    taxableAmt:    decimal("taxable_amt", { precision: 18, scale: 2 }),
    igst:          decimal("igst", { precision: 18, scale: 2 }),
    cgst:          decimal("cgst", { precision: 18, scale: 2 }),
    sgst:          decimal("sgst", { precision: 18, scale: 2 }),
    matchStatus:   text("match_status").notNull(),    // "matched"|"partial"|"missing"|"extra"
    mismatchNote:  text("mismatch_note"),
    resolvedAt:    timestamp("resolved_at"),
    createdAt:     timestamp("created_at").defaultNow(),
  });
  ```

- **API (contract-first):**
  ```yaml
  # GST Registrations
  GET    /api/gst/registrations
  POST   /api/gst/registrations
  PUT    /api/gst/registrations/:id
  POST   /api/gst/registrations/:id/validate-gstin   # hits GSTN API, returns legal name/status

  # HSN/SAC
  GET    /api/hsn-sac                               # ?q=8471&type=hsn — search
  GET    /api/hsn-sac/:code
  POST   /api/hsn-sac/classify                      # { description } → AI returns suggested code

  # Returns
  GET    /api/gst/returns                           # ?type=GSTR-1&year=2026&month=6
  POST   /api/gst/returns                           # create period draft; mutate → SELECT
  GET    /api/gst/returns/:id
  POST   /api/gst/returns/:id/prepare               # pull transactions, compute; status→prepared
  POST   /api/gst/returns/:id/file                  # push to GSTN API; status→filed; store ARN
  POST   /api/gst/returns/:id/amend                 # create amendment draft

  # e-Invoicing
  POST   /api/gst/einvoices                         # { invoiceId } → call IRP, get IRN; mutate → SELECT
  GET    /api/gst/einvoices/:id
  POST   /api/gst/einvoices/:id/cancel              # { reason, remarks }
  GET    /api/gst/einvoices/bulk-status             # bulk IRN status check

  # e-Way Bill
  POST   /api/gst/eway-bills                        # { documentId, documentType, transMode, vehicleNo, distance }
  GET    /api/gst/eway-bills/:id
  PUT    /api/gst/eway-bills/:id/update-vehicle     # Part B update
  POST   /api/gst/eway-bills/:id/cancel

  # GSTR-2B Reconciliation
  GET    /api/gst/gstr2b/:year/:month               # list reconciliation rows; ?status=missing
  POST   /api/gst/gstr2b/:year/:month/pull          # fetch from GSTN; upsert reconciliation rows
  PUT    /api/gst/gstr2b/rows/:id/resolve           # mark resolved
  GET    /api/gst/gstr2b/:year/:month/report        # downloadable mismatch report
  ```

- **Workflow / state machine:**
  ```
  GSTR-1:  open → prepared → filed → acknowledged [→ amended]
  GSTR-3B: open → itc_reconciled → prepared → filed → payment_recorded
  IRN:     pending → generated → [cancelled]
  e-Way:   pending → active → [extended] → [cancelled] → expired
  ```

- **Automations:**
  - On invoice save: if B2B + turnover threshold met + einvoice enabled → async job calls IRP, stamps IRN+QR.
  - On delivery challan/invoice with goods value > ₹50,000: prompt to generate e-way bill.
  - Intra/inter-state auto-detection: compare org state code vs. contact GSTIN state code; select CGST+SGST or IGST automatically.
  - Monthly cron: pull GSTR-2B from GSTN on 14th; run reconciliation; flag mismatches; email/webhook to accountant.
  - GSTR-1 due reminder: push on 8th of month.
  - GSTR-3B due reminder: push on 17th of month.
  - RCM flag: if supplier is unregistered and supply is notified RCM category, auto-apply RCM tax and create self-invoice.

- **Personalized / better-than-Zoho:**
  - AI HSN/SAC classifier: embedding model trained on NIC HSN master + item descriptions; `/api/hsn-sac/classify` endpoint returns top-3 suggestions with confidence scores.
  - IRN and e-way bill status tracked in tamper-evident audit ledger — every state change hash-chained.
  - GSTR-2B reconciliation dashboard with drill-down by vendor, mismatch type, and ITC at risk amount.
  - Bulk IRN generation with async queue (BullMQ/cron) + retry logic — Zoho does one-at-a-time.
  - e-Way bill Part B (vehicle update) tracking timeline on shipment card.
  - IRP credential rotation reminder 30 days before expiry.

- **Build status:** New.

---

### 6.4 VAT — UK (MTD / HMRC)

- **Purpose:** UK VAT registration, MTD-compliant VAT return preparation and direct HMRC submission, domestic reverse charge, flat-rate scheme, OSS/IOSS for digital services.

- **Zoho Books behaviour:**
  - Single VAT authority: HMRC. MTD mandatory for all VAT-registered UK businesses since 1 Nov 2022.
  - VAT number + country code from HMRC certificate; accrual or cash basis.
  - Rates: Standard (20%), Reduced (5%), Zero (0%), Exempt, Outside Scope.
  - Cross-border trading toggle: enables reverse charge on services bought from non-UK suppliers.
  - Northern Ireland Protocol: optional NI-EU trading flag.
  - **Flat Rate Scheme**: turnover ≤ £150,000; apply fixed sector percentage on gross turnover.
  - **Domestic Reverse Charge (DRC)**: construction sector; buyer accounts for VAT.
  - **VAT MOSS/OSS**: for digital services sold to non-VAT EU customers.
  - VAT return boxes 1–9 auto-populated; drill-down per box.
  - Agent authorisation: agents file with Agent Registration Number.
  - MTD VAT return submitted directly to HMRC API.
  - Deregistration when turnover < £83,000.

- **Data model:**
  ```ts
  export const vatRegistrations = mysqlTable("vat_registrations", {
    id:               int("id").autoincrement().primaryKey(),
    orgId:            int("org_id").notNull(),
    vatNumber:        text("vat_number").notNull(),
    countryCode:      text("country_code").notNull().default("GB"),
    accountingBasis:  text("accounting_basis").notNull(), // "accrual"|"cash"
    scheme:           text("scheme").notNull().default("standard"), // "standard"|"flat_rate"|"annual"
    flatRatePct:      decimal("flat_rate_pct", { precision: 5, scale: 2 }),
    registeredFrom:   timestamp("registered_from"),
    deregisteredAt:   timestamp("deregistered_at"),
    hmrcCredentials:  json("hmrc_credentials"),           // OAuth tokens for MTD API
    mosEnabled:       int("mos_enabled").notNull().default(0), // OSS/MOSS
    niProtocol:       int("ni_protocol").notNull().default(0),
    agentArnNo:       text("agent_arn_no"),
    createdAt:        timestamp("created_at").defaultNow(),
    updatedAt:        timestamp("updated_at").defaultNow().onUpdateNow(),
  });

  export const vatReturns = mysqlTable("vat_returns", {
    id:              int("id").autoincrement().primaryKey(),
    orgId:           int("org_id").notNull(),
    vatRegId:        int("vat_reg_id").notNull(),
    periodKey:       text("period_key").notNull(),        // HMRC period key e.g. "23AA"
    periodFrom:      timestamp("period_from").notNull(),
    periodTo:        timestamp("period_to").notNull(),
    status:          text("status").notNull().default("open"),
    box1:            decimal("box1", { precision: 18, scale: 2 }), // VAT due on sales
    box2:            decimal("box2", { precision: 18, scale: 2 }), // VAT due on acquisitions (NI)
    box3:            decimal("box3", { precision: 18, scale: 2 }), // Total VAT due
    box4:            decimal("box4", { precision: 18, scale: 2 }), // VAT reclaimed on purchases
    box5:            decimal("box5", { precision: 18, scale: 2 }), // Net VAT to pay/reclaim
    box6:            decimal("box6", { precision: 18, scale: 2 }), // Total value of sales
    box7:            decimal("box7", { precision: 18, scale: 2 }), // Total value of purchases
    box8:            decimal("box8", { precision: 18, scale: 2 }), // Total value of supplies to EU
    box9:            decimal("box9", { precision: 18, scale: 2 }), // Total value of acquisitions from EU
    submittedAt:     timestamp("submitted_at"),
    receiptId:       text("receipt_id"),                 // HMRC confirmation ID
    payload:         json("payload"),
    auditHash:       text("audit_hash").notNull(),
    createdAt:       timestamp("created_at").defaultNow(),
    updatedAt:       timestamp("updated_at").defaultNow().onUpdateNow(),
  });
  ```

- **API (contract-first):**
  ```yaml
  GET    /api/vat/registrations
  POST   /api/vat/registrations
  PUT    /api/vat/registrations/:id

  GET    /api/vat/returns               # ?org_id=&status=open
  POST   /api/vat/returns/prepare       # { periodKey } → compute boxes; mutate → SELECT
  GET    /api/vat/returns/:id
  GET    /api/vat/returns/:id/drilldown # transactions behind each box
  POST   /api/vat/returns/:id/submit    # POST to HMRC MTD API; status→submitted; store receiptId
  GET    /api/vat/returns/:id/obligations # pull open/fulfilled obligations from HMRC
  POST   /api/vat/returns/:id/amend

  POST   /api/vat/hmrc/auth             # initiate OAuth HMRC MTD flow
  GET    /api/vat/hmrc/callback         # OAuth callback
  ```

- **Workflow / state machine:**
  ```
  open → prepared → submitted → acknowledged [→ amended]
  ```
  HMRC MTD API returns `processingDate` on acknowledgement.

- **Automations:**
  - Pull open obligations from HMRC `/organisations/vat/{vrn}/obligations` on period start.
  - Reverse charge auto-applied: if supplier is non-UK + supply is service + org is UK business → DRC flag, Box 1 and Box 4 both adjusted.
  - Flat-rate calculation: gross turnover × sector% = VAT payable; override disabled.
  - Filing reminder 7 days before obligation due date.
  - MTD token refresh cron (HMRC tokens expire; refresh before each submission attempt).

- **Personalized / better-than-Zoho:**
  - Box drill-down with transaction-level audit trail hash-chained in ledger.
  - VAT return PDF with MTD submission receipt bundled for HMRC audit evidence.
  - DRC sub-contractor/contractor detection by SIC code on contact profile.
  - Flat-rate % lookup by sector code with history (sector rate can change; version-tracked).
  - One-click switch between standard and cash accounting with recalculation preview.

- **Build status:** New. (Basic vat-payments CRUD already exists — extend, not replace.)

---

### 6.5 VAT — EU (OSS / IOSS / Reverse Charge / Place of Supply)

- **Purpose:** EU-wide VAT compliance for cross-border B2C and B2B sales, covering OSS, IOSS, reverse charge, place-of-supply determination, and per-member-state rate management.

- **Zoho Books behaviour:**
  - **OSS (One Stop Shop)**: EU businesses register in one member state; file a single quarterly return for all intra-EU B2C distance sales. Pan-EU threshold: €10,000. Two variants: Union OSS (EU-established) and Non-Union OSS (non-EU businesses selling services to EU consumers).
  - **IOSS (Import One Stop Shop)**: for goods imported to EU ≤ €150 per consignment; collect VAT at point of sale, remit via IOSS.
  - **Legacy MOSS**: B2C TBE (Telecom, Broadcasting, Electronic services) — superseded by OSS but legacy data retained.
  - **Reverse Charge**: B2B services — place of supply = customer's country; customer self-accounts; "Reverse charge — VAT to be accounted for by the recipient" on invoice.
  - **Place-of-Supply Rules**: services → customer's country (B2B) or supplier's country with destination exceptions (B2C). Goods → ship-from country for sub-threshold; customer country above €10,000.
  - Per-member-state VAT rates stored and applied; Zoho allows adding custom member state rates.
  - B2B validation: VIES API to verify EU VAT number validity; if valid → zero-rated with reverse charge.
  - Quarterly OSS return aggregated by member state.

- **Data model:**
  ```ts
  export const euVatRegistrations = mysqlTable("eu_vat_registrations", {
    id:             int("id").autoincrement().primaryKey(),
    orgId:          int("org_id").notNull(),
    scheme:         text("scheme").notNull(),             // "oss_union"|"oss_non_union"|"ioss"|"moss"
    registrationNo: text("registration_no").notNull(),
    registeredState: text("registered_state").notNull(), // 2-letter EU member state
    registeredFrom:  timestamp("registered_from"),
    isActive:        int("is_active").notNull().default(1),
    createdAt:       timestamp("created_at").defaultNow(),
  });

  export const euMemberStateRates = mysqlTable("eu_member_state_rates", {
    id:           int("id").autoincrement().primaryKey(),
    countryCode:  text("country_code").notNull(),        // "DE"|"FR"|"IT" etc.
    rateType:     text("rate_type").notNull(),           // "standard"|"reduced"|"super_reduced"|"zero"
    rate:         decimal("rate", { precision: 6, scale: 2 }).notNull(),
    effectiveFrom: timestamp("effective_from").notNull(),
    effectiveTo:   timestamp("effective_to"),
    isActive:      int("is_active").notNull().default(1),
  });

  export const ossReturns = mysqlTable("oss_returns", {
    id:              int("id").autoincrement().primaryKey(),
    orgId:           int("org_id").notNull(),
    scheme:          text("scheme").notNull(),           // "oss"|"ioss"
    quarterYear:     int("quarter_year").notNull(),
    quarterNo:       int("quarter_no").notNull(),        // 1–4
    status:          text("status").notNull().default("open"),
    totalVat:        decimal("total_vat", { precision: 18, scale: 2 }),
    byMemberState:   json("by_member_state"),            // { DE: { sales, vat }, FR: {...} }
    submittedAt:     timestamp("submitted_at"),
    confirmationRef: text("confirmation_ref"),
    auditHash:       text("audit_hash").notNull(),
    createdAt:       timestamp("created_at").defaultNow(),
    updatedAt:       timestamp("updated_at").defaultNow().onUpdateNow(),
  });
  ```

- **API (contract-first):**
  ```yaml
  GET    /api/eu-vat/registrations
  POST   /api/eu-vat/registrations

  GET    /api/eu-vat/member-state-rates           # ?country=DE&effective_date=2026-01-01
  POST   /api/eu-vat/member-state-rates
  PUT    /api/eu-vat/member-state-rates/:id

  POST   /api/eu-vat/validate-vat-number          # { vatNumber, countryCode } → VIES API
  GET    /api/eu-vat/place-of-supply              # { supplyType, supplierCountry, customerCountry, isB2B } → resolved country

  GET    /api/eu-vat/oss-returns                  # ?year=2026&quarter=2
  POST   /api/eu-vat/oss-returns/prepare          # aggregate B2C sales by member state
  GET    /api/eu-vat/oss-returns/:id
  POST   /api/eu-vat/oss-returns/:id/submit       # POST to OSS portal API
  ```

- **Workflow / state machine:**
  ```
  OSS Return: open → aggregated → prepared → submitted → paid
  ```

- **Automations:**
  - On each B2C digital/goods sale: determine place of supply → apply correct member-state rate automatically.
  - VIES validation on contact save: if EU VAT number + valid → flag as reverse-charge; if invalid → apply local VAT.
  - Quarterly OSS return auto-aggregation cron (runs on day 1 of month following quarter end).
  - €10,000 threshold monitor: alert when cumulative EU B2C distance sales approach threshold.
  - Member-state rate update check: annual job compares stored rates against VAT Calc public rate database.

- **Personalized / better-than-Zoho:**
  - Real-time VIES validation on invoice save (Zoho validates on contact creation only).
  - Automated place-of-supply engine with explicit B2B/B2C detection (Zoho requires manual selection).
  - OSS return by-member-state breakdown with drill-down to individual invoices.
  - IOSS shipment-level tracking with customs value per consignment.

- **Build status:** New.

---

### 6.6 VAT — GCC (UAE FTA / KSA ZATCA Phase 2)

- **Purpose:** GCC-region VAT compliance: UAE VAT filing to EmaraTax portal, KSA ZATCA Phase 2 real-time e-invoicing to Fatoorah platform, multi-entity GCC management.

- **Zoho Books behaviour:**
  - **UAE**: VAT at 5%; standard, zero-rated (exports, international transport), exempt (bare land, residential). VAT return filed directly to UAE FTA EmaraTax portal. Multi-currency: foreign amounts auto-converted to AED for VAT reporting.
  - **KSA**: VAT at 15% (standard). ZATCA Phase 2 (Fatoorah integration): real-time clearance mode for B2B + reporting mode for B2C. Invoice XML + PDF/A-3, UUID per invoice, QR code, cryptographic stamp. Arabic invoice formatting mandatory. Sequential invoice numbering. Phased rollout by turnover wave (Wave 24: SAR 375K–750K, deadline 30 Jun 2026).
  - **Bahrain/Oman**: VAT at 10%/5%; similar return-based model.
  - Multi-entity: separate VAT obligations per entity within single platform.

- **Data model:**
  ```ts
  export const gccVatRegistrations = mysqlTable("gcc_vat_registrations", {
    id:                int("id").autoincrement().primaryKey(),
    orgId:             int("org_id").notNull(),
    country:           text("country").notNull(),         // "AE"|"SA"|"BH"|"OM"|"KW"|"QA"
    vatNumber:         text("vat_number").notNull(),
    legalNameAr:       text("legal_name_ar"),             // Arabic legal name (KSA mandatory)
    scheme:            text("scheme").notNull().default("standard"),
    filingFrequency:   text("filing_frequency").notNull(), // "monthly"|"quarterly"
    zatcaPhase:        text("zatca_phase"),               // "1"|"2" (KSA only)
    zatcaCsid:         text("zatca_csid"),                // Compliance CSID from ZATCA
    zatcaPrivateKey:   text("zatca_private_key"),         // encrypted
    ftaCredentials:    json("fta_credentials"),           // UAE EmaraTax credentials
    isActive:          int("is_active").notNull().default(1),
    createdAt:         timestamp("created_at").defaultNow(),
    updatedAt:         timestamp("updated_at").defaultNow().onUpdateNow(),
  });

  export const zatcaInvoices = mysqlTable("zatca_invoices", {
    id:             int("id").autoincrement().primaryKey(),
    orgId:          int("org_id").notNull(),
    invoiceId:      int("invoice_id").notNull(),
    uuid:           text("uuid").notNull(),               // UUID per ZATCA spec
    invoiceHash:    text("invoice_hash").notNull(),       // PIH hash
    digitalSignature: text("digital_signature"),
    qrCode:         text("qr_code"),
    xmlContent:     text("xml_content"),                 // UBL 2.1 XML
    submissionMode: text("submission_mode").notNull(),   // "clearance"|"reporting"
    status:         text("status").notNull().default("pending"),
    zatcaResponse:  json("zatca_response"),
    submittedAt:    timestamp("submitted_at"),
    clearedAt:      timestamp("cleared_at"),
    createdAt:      timestamp("created_at").defaultNow(),
  });

  export const gccVatReturns = mysqlTable("gcc_vat_returns", {
    id:              int("id").autoincrement().primaryKey(),
    orgId:           int("org_id").notNull(),
    gccRegId:        int("gcc_reg_id").notNull(),
    periodFrom:      timestamp("period_from").notNull(),
    periodTo:        timestamp("period_to").notNull(),
    status:          text("status").notNull().default("open"),
    outputVat:       decimal("output_vat", { precision: 18, scale: 2 }),
    inputVat:        decimal("input_vat", { precision: 18, scale: 2 }),
    netPayable:      decimal("net_payable", { precision: 18, scale: 2 }),
    submittedAt:     timestamp("submitted_at"),
    confirmationRef: text("confirmation_ref"),
    auditHash:       text("audit_hash").notNull(),
    createdAt:       timestamp("created_at").defaultNow(),
    updatedAt:       timestamp("updated_at").defaultNow().onUpdateNow(),
  });
  ```

- **API (contract-first):**
  ```yaml
  GET    /api/gcc-vat/registrations
  POST   /api/gcc-vat/registrations
  PUT    /api/gcc-vat/registrations/:id

  # ZATCA (KSA)
  POST   /api/gcc-vat/zatca/onboard          # CSID onboarding flow with ZATCA Fatoorah
  POST   /api/gcc-vat/zatca/invoices         # { invoiceId } → generate XML, sign, submit; mutate → SELECT
  GET    /api/gcc-vat/zatca/invoices/:id
  POST   /api/gcc-vat/zatca/invoices/:id/cancel

  # UAE FTA
  POST   /api/gcc-vat/uae/returns/prepare    # { periodFrom, periodTo } → compute; mutate → SELECT
  POST   /api/gcc-vat/uae/returns/:id/submit # POST to EmaraTax API

  # Generic GCC returns
  GET    /api/gcc-vat/returns               # ?country=AE&status=open
  GET    /api/gcc-vat/returns/:id
  ```

- **Workflow / state machine:**
  ```
  ZATCA Invoice: pending → signed → submitted → [cleared (B2B) | reported (B2C)] → [rejected → resubmit]
  VAT Return:   open → prepared → submitted → paid
  ```

- **Automations:**
  - On KSA invoice save: async job signs with CSID private key, generates UBL XML, submits to Fatoorah; stores UUID + QR.
  - B2B KSA invoices: clearance mode (sync confirmation required before invoice is legally valid).
  - B2C KSA invoices: reporting mode (submit within 24 hrs).
  - ZATCA CSID renewal cron: renew before expiry.
  - UAE return: auto-populate from transaction register filtered by VAT registration.

- **Personalized / better-than-Zoho:**
  - Cryptographic signature verification endpoint — anyone can verify an Astram ZATCA invoice offline.
  - Fatoorah submission retry queue with exponential back-off (Zoho has no visible retry queue).
  - Arabic legal name auto-populated from commercial register API lookup.
  - Multi-country GCC dashboard: all VAT obligations across AE/SA/BH in one view.

- **Build status:** New.

---

### 6.7 US Sales Tax (Nexus / Multi-Jurisdiction / Avalara)

- **Purpose:** US multi-state sales tax calculation, nexus tracking, product taxability, exemption certificate management, liability reporting, and Avalara AvaTax integration.

- **Zoho Books behaviour:**
  - Built-in Avalara slice: auto-calculates rates on every transaction across nexus states; fallback manual rates.
  - Nexus configuration: list of states where business has physical or economic nexus (South Dakota v. Wayfair economic nexus thresholds vary by state).
  - Product tax codes (PTC): Avalara codes determine taxability per product/state.
  - Exemption certificates: upload, store, associate to customer + states, track expiry.
  - Use tax: for purchases made out-of-state but used in-state.
  - Tax override: county/city rate override when automatic rate is incorrect.
  - Sales tax liability report: state-level; what collected vs. what owed.
  - Exceptions report: transactions with manually calculated tax or missing data.
  - Full Avalara AvaTax integration via Marketplace for deeper nexus monitoring, filing, and registration support.
  - TaxJar also supported as alternative.
  - Manual tax rate fallback when Avalara unavailable.

- **Data model:**
  ```ts
  export const usTaxNexus = mysqlTable("us_tax_nexus", {
    id:               int("id").autoincrement().primaryKey(),
    orgId:            int("org_id").notNull(),
    state:            text("state").notNull(),            // 2-letter state code
    nexusType:        text("nexus_type").notNull(),       // "physical"|"economic"
    economicThresholdAmt: decimal("economic_threshold_amt", { precision: 18, scale: 2 }),
    economicThresholdTxn: int("economic_threshold_txn"),
    registrationNo:   text("registration_no"),
    effectiveFrom:    timestamp("effective_from").notNull(),
    effectiveTo:      timestamp("effective_to"),
    isActive:         int("is_active").notNull().default(1),
    createdAt:        timestamp("created_at").defaultNow(),
  });

  export const taxExemptionCerts = mysqlTable("tax_exemption_certs", {
    id:             int("id").autoincrement().primaryKey(),
    orgId:          int("org_id").notNull(),
    contactId:      int("contact_id").notNull(),
    exemptionType:  text("exemption_type").notNull(),    // "resale"|"nonprofit"|"government"|"other"
    stateCode:      text("state_code"),                  // null = all states
    certNumber:     text("cert_number"),
    certFile:       text("cert_file"),                   // S3/storage path
    validFrom:      timestamp("valid_from"),
    expiresAt:      timestamp("expires_at"),
    status:         text("status").notNull().default("active"), // active|expired|revoked
    notes:          text("notes"),
    createdAt:      timestamp("created_at").defaultNow(),
    updatedAt:      timestamp("updated_at").defaultNow().onUpdateNow(),
  });

  export const usTaxJurisdictions = mysqlTable("us_tax_jurisdictions", {
    id:           int("id").autoincrement().primaryKey(),
    orgId:        int("org_id").notNull(),
    taxAuthId:    int("tax_auth_id").notNull(),
    state:        text("state").notNull(),
    county:       text("county"),
    city:         text("city"),
    zipCode:      text("zip_code"),
    stateRate:    decimal("state_rate", { precision: 8, scale: 4 }),
    countyRate:   decimal("county_rate", { precision: 8, scale: 4 }),
    cityRate:     decimal("city_rate", { precision: 8, scale: 4 }),
    specialRate:  decimal("special_rate", { precision: 8, scale: 4 }),
    combinedRate: decimal("combined_rate", { precision: 8, scale: 4 }),
    effectiveFrom: timestamp("effective_from").notNull(),
    effectiveTo:   timestamp("effective_to"),
    source:        text("source").notNull().default("manual"), // "manual"|"avalara"|"taxjar"
    updatedAt:     timestamp("updated_at").defaultNow().onUpdateNow(),
  });
  ```

- **API (contract-first):**
  ```yaml
  GET    /api/us-tax/nexus                    # list nexus states
  POST   /api/us-tax/nexus
  PUT    /api/us-tax/nexus/:id
  DELETE /api/us-tax/nexus/:id

  GET    /api/us-tax/jurisdictions            # ?state=CA&zip=90210
  POST   /api/us-tax/jurisdictions/sync-avalara # pull latest rates from Avalara/TaxJar

  GET    /api/us-tax/exemptions               # ?contact_id=&state=NY&status=active
  POST   /api/us-tax/exemptions               # create cert; mutate → SELECT
  PUT    /api/us-tax/exemptions/:id
  DELETE /api/us-tax/exemptions/:id           # soft-delete

  POST   /api/us-tax/calculate                # { lineItems, shipToAddress, customerId } → TaxBreakdown[]
  GET    /api/us-tax/liability-report          # ?year=2026&state=CA — aggregated tax collected vs owed
  GET    /api/us-tax/exceptions-report         # transactions with missing/manual tax

  POST   /api/us-tax/avalara/connect          # store Avalara credentials
  GET    /api/us-tax/avalara/status           # connectivity + subscription info
  ```

- **Workflow / state machine:** No formal state machine for US sales tax (not filed from the portal — remitted manually per state). Liability report drives external filing.

- **Automations:**
  - On transaction save in nexus state: call Avalara AvaTax API (or built-in rate table) → apply line-item rates.
  - Exemption expiry cron: 30-day warning email before cert expires.
  - Economic nexus threshold monitor: track cumulative sales per state; alert at 80% of threshold.
  - Quarterly nexus review reminder.
  - Avalara rate sync cron: weekly pull of updated jurisdiction rates.

- **Personalized / better-than-Zoho:**
  - Economic nexus threshold tracker per state with real-time progress bar (Wayfair thresholds vary: $100K sales or 200 transactions).
  - Multi-provider tax calculation: Avalara primary, TaxJar fallback, built-in offline.
  - Exemption certificate digital upload with OCR extraction of cert number, state, and expiry.
  - Liability report exportable to state-specific filing format stubs.

- **Build status:** New.

---

### 6.8 TDS / TCS — India (Withholding Tax)

- **Purpose:** Indian withholding tax compliance — Tax Deducted at Source (TDS) on payments to vendors and Tax Collected at Source (TCS) on collections from customers, under ITA 2025 (effective April 1, 2026).

- **Zoho Books behaviour:**
  - **TDS**: applied at transaction level or line-item level on Bills, POs, Recurring Bills, Vendor Credits, Vendor Advances, and on Invoices/Sales Orders for Income TDS (tax received under deduction).
  - Sections: consolidated under Section 393 (ITA 2025) replacing 194-series. Key payment types: contractors (194C→393), professionals (194J→393), rent, commission, interest, salary.
  - Rates set by Income Tax Department; users select from dropdown or create custom via "Manage TDS."
  - Surcharge: extra levy on high-income individuals.
  - Cess: additional tax on TDS amount.
  - TDS override: edit deducted amount post-selection.
  - Vendor-level TDS: set default section + rate per vendor, auto-applies to all their bills.
  - **TCS**: collected from customers on certain goods/services. Section 394 (replaces 206C). Key categories: scrap, minerals, tendu leaves, LRS remittances, overseas tour packages, motor vehicles, foreign remittances. From April 1 2026: most at 2%.
  - Return forms: TDS → Form 138 (salary), Form 140 (non-salary residents), Form 141 (rent/property), Form 144 (non-residents). TCS → Form 143 (replaces Form 27EQ).
  - **GST TDS**: separate 2% GST TDS deducted by notified government purchasers; tracked separately.
  - TDS certificates: Form 130 (replaces Form 16 for salary TDS); issue to vendors quarterly/annually.

- **Data model:**
  ```ts
  export const tdsConfig = mysqlTable("tds_config", {
    id:             int("id").autoincrement().primaryKey(),
    orgId:          int("org_id").notNull(),
    enabled:        int("enabled").notNull().default(0),
    tanNumber:      text("tan_number"),                  // Tax Deduction Account Number
    panNumber:      text("pan_number"),
    deductorType:   text("deductor_type"),               // "company"|"individual"…
    createdAt:      timestamp("created_at").defaultNow(),
    updatedAt:      timestamp("updated_at").defaultNow().onUpdateNow(),
  });

  export const tdsSections = mysqlTable("tds_sections", {
    id:             int("id").autoincrement().primaryKey(),
    orgId:          int("org_id").notNull(),
    sectionCode:    text("section_code").notNull(),       // "393_contractor"|"393_professional"…
    legacySection:  text("legacy_section"),              // "194C" for reference
    description:    text("description").notNull(),
    paymentCategory: text("payment_category"),
    baseRate:       decimal("base_rate", { precision: 6, scale: 2 }).notNull(),
    surchargePct:   decimal("surcharge_pct", { precision: 6, scale: 2 }).default("0"),
    cessPct:        decimal("cess_pct", { precision: 6, scale: 2 }).default("0"),
    thresholdAmt:   decimal("threshold_amt", { precision: 18, scale: 2 }),
    effectiveFrom:  timestamp("effective_from").notNull(),
    effectiveTo:    timestamp("effective_to"),
    tdsType:        text("tds_type").notNull(),           // "tds"|"tcs"|"gst_tds"
    isActive:       int("is_active").notNull().default(1),
    createdAt:      timestamp("created_at").defaultNow(),
  });

  export const tdsTransactions = mysqlTable("tds_transactions", {
    id:              int("id").autoincrement().primaryKey(),
    orgId:           int("org_id").notNull(),
    documentId:      int("document_id").notNull(),
    documentType:    text("document_type").notNull(),    // "bill"|"invoice"|"advance"
    contactId:       int("contact_id").notNull(),
    sectionId:       int("section_id").notNull(),
    baseAmount:      decimal("base_amount", { precision: 18, scale: 2 }).notNull(),
    tdsRate:         decimal("tds_rate", { precision: 6, scale: 2 }).notNull(),
    tdsAmount:       decimal("tds_amount", { precision: 18, scale: 2 }).notNull(),
    surchargeAmt:    decimal("surcharge_amt", { precision: 18, scale: 2 }).default("0"),
    cessAmt:         decimal("cess_amt", { precision: 18, scale: 2 }).default("0"),
    totalTdsAmt:     decimal("total_tds_amt", { precision: 18, scale: 2 }).notNull(),
    appliedAt:       text("applied_at").notNull(),        // "transaction"|"line_item"
    overridden:      int("overridden").notNull().default(0),
    deductedDate:    timestamp("deducted_date"),
    createdAt:       timestamp("created_at").defaultNow(),
  });

  export const tdsReturns = mysqlTable("tds_returns", {
    id:              int("id").autoincrement().primaryKey(),
    orgId:           int("org_id").notNull(),
    returnForm:      text("return_form").notNull(),       // "138"|"140"|"141"|"143"|"144"
    quarterNo:       int("quarter_no").notNull(),         // 1–4
    financialYear:   text("financial_year").notNull(),    // "2026-27"
    status:          text("status").notNull().default("open"),
    totalTds:        decimal("total_tds", { precision: 18, scale: 2 }),
    totalTcs:        decimal("total_tcs", { precision: 18, scale: 2 }),
    filedAt:         timestamp("filed_at"),
    ackNo:           text("ack_no"),
    auditHash:       text("audit_hash").notNull(),
    createdAt:       timestamp("created_at").defaultNow(),
    updatedAt:       timestamp("updated_at").defaultNow().onUpdateNow(),
  });
  ```

- **API (contract-first):**
  ```yaml
  GET    /api/tds/config
  PUT    /api/tds/config                      # set TAN, PAN, deductor type

  GET    /api/tds/sections                    # ?type=tds&is_active=1&effective_date=2026-04-01
  POST   /api/tds/sections
  PUT    /api/tds/sections/:id

  POST   /api/tds/calculate                   # { documentType, documentId, contactId } → TdsBreakdown
  GET    /api/tds/transactions                # ?quarter=1&fy=2026-27&contact_id=
  GET    /api/tds/transactions/:id

  GET    /api/tds/returns                     # ?form=140&fy=2026-27
  POST   /api/tds/returns/prepare             # { form, quarter, fy } → aggregate; mutate → SELECT
  POST   /api/tds/returns/:id/file            # generate e-TDS FVU file; mark filed; store ack
  POST   /api/tds/returns/:id/certificate     # generate Form 130 / Form 16A PDF for contact
  GET    /api/tds/returns/:id/certificate/:contactId  # download TDS cert

  # Vendor TDS defaults
  PUT    /api/contacts/:id/tds-defaults       # { sectionId, panNumber }
  GET    /api/contacts/:id/tds-defaults
  ```

- **Workflow / state machine:**
  ```
  TDS Return: open → aggregated → validated → filed → certificate_issued
  ```

- **Automations:**
  - On bill/invoice save: check vendor TDS default → auto-apply section + rate if above threshold.
  - April 1, 2026 migration cron: old 194-series sections → Section 393/394 mapping; update all active vendor defaults; deprecate old rates.
  - Quarterly TDS return reminder (15th of month following quarter end).
  - TDS certificate generation batch job at year-end.
  - GST TDS: separate ledger entry when buyer is notified government entity.

- **Personalized / better-than-Zoho:**
  - Section 393/394 ITA 2025 migration ran automatically with audit log of every vendor mapping changed.
  - TDS certificate (Form 130) PDF generated natively with digital signature support.
  - Cumulative TDS liability tracker per vendor per FY with threshold alert.
  - TDS mismatch report: compare Form 26AS (fetched via TRACES API) against internal deductions.

- **Build status:** New.

---

### 6.9 Digital Tax / VAT MOSS / OSS (Cross-Region Digital Services)

- **Purpose:** Track and report VAT on digital services sold to consumers across multiple tax jurisdictions (EU OSS, UK MOSS-equivalent, Australian GST on digital services, etc.).

- **Zoho Books behaviour:**
  - MOSS (legacy pre-Jul 2021): register in one EU state; file quarterly MOSS return for B2C TBE (Telecom, Broadcasting, Electronic services) to all EU member states.
  - OSS (from Jul 2021): replaces MOSS; single EU quarterly return for B2C digital services + goods. Pan-EU €10,000 threshold; below = home state VAT applies.
  - IOSS: imported goods ≤ €150; collect destination VAT at point of sale.
  - Contact-level "Track sale of digital service under MOSS" flag.
  - Per-sale: country of customer (determined by 2 non-contradictory pieces of evidence), applicable member-state VAT rate applied.
  - MOSS/OSS return generated quarterly; filed to registration state's tax authority.
  - For UK post-Brexit: separate MOSS-style registration with HMRC for UK consumers.
  - Zoho generates OSS/IOSS scheme reports from transaction data.

- **Data model:** (extends `eu_vat_registrations` and `oss_returns` from §6.5; add digital service flag on items)
  ```ts
  export const digitalServiceItems = mysqlTable("digital_service_items", {
    id:          int("id").autoincrement().primaryKey(),
    orgId:       int("org_id").notNull(),
    itemId:      int("item_id").notNull(),                // reference to items table
    serviceType: text("service_type").notNull(),         // "telecom"|"broadcasting"|"electronic"
    isOssScoped: int("is_oss_scoped").notNull().default(1),
    createdAt:   timestamp("created_at").defaultNow(),
  });

  export const digitalSaleEvidence = mysqlTable("digital_sale_evidence", {
    id:           int("id").autoincrement().primaryKey(),
    transactionId: int("transaction_id").notNull(),
    evidence1Type: text("evidence1_type"),               // "billing_address"|"ip_country"|"bank_country"
    evidence1Val:  text("evidence1_val"),
    evidence2Type: text("evidence2_type"),
    evidence2Val:  text("evidence2_val"),
    resolvedCountry: text("resolved_country").notNull(),
    resolvedRate:  decimal("resolved_rate", { precision: 6, scale: 2 }),
    createdAt:     timestamp("created_at").defaultNow(),
  });
  ```

- **API (contract-first):**
  ```yaml
  POST   /api/digital-tax/determine-country      # { billingCountry, ipCountry, bankCountry } → resolved country + rate
  GET    /api/digital-tax/oss-report             # ?quarter=2&year=2026 — per-country breakdown
  POST   /api/digital-tax/oss-report/export      # CSV/XML for portal upload
  GET    /api/digital-tax/items                  # list digital service items
  POST   /api/digital-tax/items                  # { itemId, serviceType }
  ```

- **Workflow / state machine:** Identical to OSS returns (§6.5).

- **Automations:** On invoice with digital service item to EU/UK consumer: resolve country from 2-evidence rule → apply member-state rate → record evidence → aggregate into OSS return. Threshold monitor for €10,000 cross-EU distance-selling limit.

- **Personalized / better-than-Zoho:** 2-evidence rule engine (IP geolocation + billing address + bank country) with conflict resolution and evidence audit trail per transaction. OSS return export in EU-standard XML format.

- **Build status:** New.

---

### 6.10 Tax Exemptions

- **Purpose:** Customer-level and item-level tax exemptions with certificate management, expiry tracking, and per-jurisdiction overrides.

- **Zoho Books behaviour:**
  - Exemption reasons: resale, nonprofit, government, agricultural, manufacturing, other — configurable.
  - Customer-level: mark contact as tax-exempt; attach reason; transactions auto-zero-rate.
  - Item-level: mark line item as Non-Taxable on invoice with exemption reason.
  - US: upload exemption certificate per customer + state; track expiry; certificate file storage.
  - India (GST): "Nil-rated," "Exempt," "Zero-rated (exports)" are distinct categories affecting ITC.
  - UK: zero-rated vs. exempt have different VAT return treatment (zero-rated = input VAT reclaimable; exempt = not).
  - Exemption type drives which VAT/GST box the supply falls into.

- **Data model:** (core: `tax_exemption_certs` in §6.7; extend with item and reason tables)
  ```ts
  export const taxExemptionReasons = mysqlTable("tax_exemption_reasons", {
    id:          int("id").autoincrement().primaryKey(),
    orgId:       int("org_id").notNull(),
    region:      text("region").notNull(),
    code:        text("code").notNull(),                  // "resale"|"nonprofit"|"zero_rated_export"
    description: text("description").notNull(),
    vatTreatment: text("vat_treatment"),                 // "zero_rated"|"exempt"|"outside_scope"
    isBuiltIn:   int("is_built_in").notNull().default(0),
    isActive:    int("is_active").notNull().default(1),
    createdAt:   timestamp("created_at").defaultNow(),
  });

  export const contactTaxExemptions = mysqlTable("contact_tax_exemptions", {
    id:             int("id").autoincrement().primaryKey(),
    orgId:          int("org_id").notNull(),
    contactId:      int("contact_id").notNull(),
    exemptionReasonId: int("exemption_reason_id").notNull(),
    stateCode:      text("state_code"),                  // null = all jurisdictions
    certId:         int("cert_id"),                      // → tax_exemption_certs
    validFrom:      timestamp("valid_from"),
    validTo:        timestamp("valid_to"),
    isActive:       int("is_active").notNull().default(1),
    createdAt:      timestamp("created_at").defaultNow(),
  });
  ```

- **API (contract-first):**
  ```yaml
  GET    /api/tax-exemptions/reasons            # ?region=US
  POST   /api/tax-exemptions/reasons
  PUT    /api/tax-exemptions/reasons/:id

  GET    /api/tax-exemptions/contacts           # ?contact_id=&state=NY&status=active
  POST   /api/tax-exemptions/contacts           # attach exemption to contact; mutate → SELECT
  PUT    /api/tax-exemptions/contacts/:id
  DELETE /api/tax-exemptions/contacts/:id

  GET    /api/tax-exemptions/certs              # list certificates
  POST   /api/tax-exemptions/certs              # upload cert; mutate → SELECT; return id
  GET    /api/tax-exemptions/certs/:id/file     # download cert file
  DELETE /api/tax-exemptions/certs/:id

  GET    /api/tax-exemptions/expiring           # ?days=30 — certs expiring within N days
  ```

- **Workflow / state machine:** Certificate: `active → expiring (30 days out) → expired → [renewed]`

- **Automations:** Expiry cron daily: flag certs expiring in 30 days; email contact/accountant. On invoice save: check contact exemptions for ship-to state; if valid cert → zero-rate line items; log exemption reason on transaction.

- **Personalized / better-than-Zoho:** OCR on uploaded cert PDF to extract cert number, state, expiry, and exemption type automatically. Bulk cert upload for multi-state exemptions. Avalara exemption certificate portal integration (CertCapture API) as optional backend.

- **Build status:** New.

---

### 6.11 Multi-Tax on Line Items (Compound Tax / Cascading / Tax Groups)

- **Purpose:** Apply multiple taxes simultaneously or sequentially on a single line item; support compound (cascading) tax, tax group selection, and partial-line tax overrides.

- **Zoho Books behaviour:**
  - **Tax Group**: assign group to line item → all member rates applied simultaneously to base amount.
  - **Compound Tax**: second tax applied on (base + first tax); e.g. Cess on (subtotal + GST).
  - Line-item level: each line independently taxable; different lines can carry different tax rates/groups.
  - Override at line level: "Non-Taxable" override with reason; or manual rate override.
  - India: mandatory line-item HSN/SAC code + auto-selects CGST+SGST or IGST per party state.
  - US: multi-jurisdiction — state + county + city + special district taxes stacked on single line.
  - Tax-exclusive vs. tax-inclusive pricing toggle: affects whether rate applies to pre-tax or post-tax price.

- **Data model:**
  ```ts
  export const documentLineItemTaxes = mysqlTable("document_line_item_taxes", {
    id:             int("id").autoincrement().primaryKey(),
    orgId:          int("org_id").notNull(),
    documentId:     int("document_id").notNull(),
    lineItemId:     int("line_item_id").notNull(),
    taxRateId:      int("tax_rate_id"),                  // null if group applied
    taxGroupId:     int("tax_group_id"),                 // null if single rate applied
    taxableBasis:   decimal("taxable_basis", { precision: 18, scale: 2 }).notNull(),
    rate:           decimal("rate", { precision: 8, scale: 4 }).notNull(),
    taxAmount:      decimal("tax_amount", { precision: 18, scale: 2 }).notNull(),
    taxType:        text("tax_type").notNull(),           // "simple"|"compound"
    compoundOnId:   int("compound_on_id"),               // line_item_tax id of base tax
    isExempt:       int("is_exempt").notNull().default(0),
    exemptReasonId: int("exempt_reason_id"),
    isOverride:     int("is_override").notNull().default(0),
    specificType:   text("specific_type"),               // "cgst"|"sgst"|"igst"|"cess"|"state"|"county"
    createdAt:      timestamp("created_at").defaultNow(),
  });
  ```

- **API (contract-first):** Line item taxes are computed server-side via the tax-engine on every document save; not a standalone endpoint. Tax breakdown returned within document response:
  ```yaml
  POST/PUT /api/invoices/:id      # request includes lineItems[].taxRateId or taxGroupId
                                   # response includes lineItems[].taxBreakdown[]
  POST     /api/tax/preview-calculation  # { lineItems, partyState, orgState, date } → breakdown (no persist)
  ```

- **Automations:** Tax engine called synchronously on document compute; compound chain resolved in dependency order; GST inter/intra-state detection runs before rate selection.

- **Personalized / better-than-Zoho:** Tax preview endpoint — returns full breakdown before committing a transaction, enabling real-time UI tax display as user types line items. Audit-ledger entry on every tax override.

- **Build status:** New.

---

### 6.12 Tax Reports & Filing / Returns

- **Purpose:** Generate all statutory tax reports and return summaries, support export for external filing, and provide in-app submission where authority APIs support it.

- **Zoho Books behaviour (reports):**
  - **India**: GSTR-1, GSTR-3B, GSTR-9 (annual), GSTR-2B reconciliation report, TDS/TCS quarterly returns (Form 138/140/141/143/144), HSN summary, tax liability by slab.
  - **UK**: VAT return (boxes 1–9), VAT audit trail by box, Flat Rate Scheme computation.
  - **EU/OSS**: OSS/IOSS quarterly return by member state, MOSS return (legacy).
  - **GCC**: UAE VAT return, KSA VAT return; ZATCA submission log.
  - **US**: Sales tax liability by state, exemption report, exceptions report, use tax report.
  - Export formats: PDF, CSV, GSTN-JSON (India), MTD JSON (UK).
  - Filing periods can be locked (no edits to transactions within closed period).

- **Data model:**
  ```ts
  export const taxFilingPeriods = mysqlTable("tax_filing_periods", {
    id:             int("id").autoincrement().primaryKey(),
    orgId:          int("org_id").notNull(),
    taxAuthorityId: int("tax_authority_id").notNull(),
    periodFrom:     timestamp("period_from").notNull(),
    periodTo:       timestamp("period_to").notNull(),
    periodLabel:    text("period_label").notNull(),       // "Apr 2026 – Jun 2026"
    status:         text("status").notNull().default("open"),
    lockedAt:       timestamp("locked_at"),
    lockedBy:       int("locked_by"),
    createdAt:      timestamp("created_at").defaultNow(),
    updatedAt:      timestamp("updated_at").defaultNow().onUpdateNow(),
  });

  export const taxReportRuns = mysqlTable("tax_report_runs", {
    id:              int("id").autoincrement().primaryKey(),
    orgId:           int("org_id").notNull(),
    reportType:      text("report_type").notNull(),       // "gstr1"|"gstr3b"|"vat_return"|"oss"…
    periodId:        int("period_id"),
    periodFrom:      timestamp("period_from"),
    periodTo:        timestamp("period_to"),
    status:          text("status").notNull().default("pending"), // pending|running|complete|error
    outputPath:      text("output_path"),                // file storage path
    summary:         json("summary"),                    // computed totals
    generatedAt:     timestamp("generated_at"),
    createdAt:       timestamp("created_at").defaultNow(),
  });
  ```

- **API (contract-first):**
  ```yaml
  GET    /api/tax-periods                       # ?authority_id=&status=open
  POST   /api/tax-periods                       # create period
  PUT    /api/tax-periods/:id
  POST   /api/tax-periods/:id/lock              # lock period; prevents transaction edits
  POST   /api/tax-periods/:id/unlock

  GET    /api/tax-reports                       # ?type=gstr1&org_id=&period_id=
  POST   /api/tax-reports/generate              # { reportType, periodFrom, periodTo } → async job; mutate → SELECT run
  GET    /api/tax-reports/:id                   # poll status
  GET    /api/tax-reports/:id/download          # stream PDF/CSV/JSON

  # Convenience wrappers (delegate to region engines)
  GET    /api/tax-reports/gst-summary           # India: slab-wise summary
  GET    /api/tax-reports/hsn-summary           # India: HSN-wise outward supplies
  GET    /api/tax-reports/tax-liability         # US: state-level collected vs. owed
  GET    /api/tax-reports/oss-by-country        # EU: OSS per member state
  ```

- **Workflow / state machine:**
  ```
  Filing Period: open → locked → return_prepared → return_filed → payment_recorded → closed
  ```
  Locking a period prevents any transaction within that date range from being edited (enforced at document-save middleware level).

- **Automations:**
  - Period auto-creation: on org onboarding and on calendar roll-over per authority filing frequency.
  - Due-date reminders: N days before period due date (configurable per authority).
  - Report generation queue: async worker processes large report runs (millions of line items); status polled via `GET /api/tax-reports/:id`.

- **Personalized / better-than-Zoho:**
  - All filed returns stored in tamper-evident audit ledger with hash chain — any tampering detectable.
  - Period lock enforced at API middleware level — no backdated transaction edits possible once locked (Zoho allows override via settings).
  - Report run history with diff between re-runs (flag what changed and why).
  - Multi-authority report dashboard: all open periods across all regions in one view.

- **Build status:** New.

---

### 6.13 Tax Payments & Liability Tracking

- **Purpose:** Record tax payments remitted to authorities, track outstanding liability, reconcile collected tax against paid tax, and provide real-time liability position.

- **Zoho Books behaviour:**
  - **Generate Tax Due**: specify authority, start/end date, basis (accrual/cash) → system computes net tax payable.
  - **Record Payment**: payment date, paid-through account (bank/CC), reference number, challan date, CPIN (India GST).
  - Payment history tab; running balance of paid vs. due.
  - **Adjustments**: rounding differences, penalties, discounts — debit/credit to tax liability account; requires adjustment reason.
  - Adjustment types: positive (expense account) or negative (income account).
  - Tax liability ledger account auto-maintained; GST liability split into CGST/SGST/IGST payable accounts.
  - India: CPIN (Common Portal Identification Number) from the GST portal challan; links payment to return.
  - US: no in-app filing — liability report drives manual state-by-state remittance.

- **Data model:**
  ```ts
  export const taxPayments = mysqlTable("tax_payments", {
    id:              int("id").autoincrement().primaryKey(),
    orgId:           int("org_id").notNull(),
    taxAuthorityId:  int("tax_authority_id").notNull(),
    periodId:        int("period_id"),
    returnId:        int("return_id"),                   // optional link to filed return
    paymentDate:     timestamp("payment_date").notNull(),
    amount:          decimal("amount", { precision: 18, scale: 2 }).notNull(),
    currency:        text("currency").notNull().default("INR"),
    paidThroughAccId: int("paid_through_acc_id").notNull(),
    referenceNo:     text("reference_no"),
    challanDate:     timestamp("challan_date"),
    cpin:            text("cpin"),                       // India GST only
    paymentMode:     text("payment_mode"),               // "online"|"cheque"|"neft"
    notes:           text("notes"),
    auditHash:       text("audit_hash").notNull(),
    createdAt:       timestamp("created_at").defaultNow(),
    updatedAt:       timestamp("updated_at").defaultNow().onUpdateNow(),
  });

  export const taxAdjustments = mysqlTable("tax_adjustments", {
    id:              int("id").autoincrement().primaryKey(),
    orgId:           int("org_id").notNull(),
    taxAuthorityId:  int("tax_authority_id").notNull(),
    periodId:        int("period_id"),
    adjustmentDate:  timestamp("adjustment_date").notNull(),
    amount:          decimal("amount", { precision: 18, scale: 2 }).notNull(), // + = extra liability, - = credit
    adjustmentAccId: int("adjustment_acc_id").notNull(),
    reason:          text("reason").notNull(),
    adjustmentType:  text("adjustment_type").notNull(),  // "penalty"|"rounding"|"discount"|"interest"
    auditHash:       text("audit_hash").notNull(),
    createdAt:       timestamp("created_at").defaultNow(),
  });

  export const taxLiabilitySummary = mysqlTable("tax_liability_summary", {
    id:              int("id").autoincrement().primaryKey(),
    orgId:           int("org_id").notNull(),
    taxAuthorityId:  int("tax_authority_id").notNull(),
    asOfDate:        timestamp("as_of_date").notNull(),
    taxCollected:    decimal("tax_collected", { precision: 18, scale: 2 }).notNull(),
    taxPaid:         decimal("tax_paid", { precision: 18, scale: 2 }).notNull(),
    adjustments:     decimal("adjustments", { precision: 18, scale: 2 }).notNull(),
    netLiability:    decimal("net_liability", { precision: 18, scale: 2 }).notNull(),
    currency:        text("currency").notNull(),
    computedAt:      timestamp("computed_at").defaultNow(),
    auditHash:       text("audit_hash").notNull(),
  });
  ```

- **API (contract-first):**
  ```yaml
  GET    /api/tax-payments                      # ?authority_id=&period_id=&year=2026
  POST   /api/tax-payments                      # record payment; mutate → SELECT; updates liability
  GET    /api/tax-payments/:id
  PUT    /api/tax-payments/:id
  DELETE /api/tax-payments/:id                  # soft-delete with audit entry

  GET    /api/tax-adjustments                   # ?authority_id=&period_id=
  POST   /api/tax-adjustments                   # create adjustment; mutate → SELECT
  GET    /api/tax-adjustments/:id

  GET    /api/tax-liability                     # ?authority_id=&as_of=2026-06-30 — current position
  POST   /api/tax-liability/compute             # { authorityId, periodFrom, periodTo } → snapshot; mutate → SELECT
  GET    /api/tax-liability/history             # time-series of computed snapshots
  ```

- **Workflow / state machine:**
  ```
  Tax Due: computed → payment_recorded → reconciled
  ```
  After payment is recorded for a filed return → return status advances to `payment_recorded`.

- **Automations:**
  - On return filing: auto-compute net payable; create pending tax-due record in liability tracker.
  - On payment record: decrement liability; if fully settled → mark return `closed`.
  - Liability dashboard refreshed on each payment event via TanStack Query invalidation.
  - Overdue payment cron: if `net_liability > 0` and `period.due_date` past → push notification + audit entry.
  - Interest/penalty calculator: configurable per authority (e.g. GSTN charges 18% p.a. interest).

- **Personalized / better-than-Zoho:**
  - Every payment and adjustment is hash-chained into the tamper-evident audit ledger — CPIN + payment date + amount creates an immutable receipt.
  - Real-time liability ticker on dashboard: shows net tax owed across all authorities at-a-glance.
  - Penalty/interest auto-calculator with rate config per authority (Zoho requires manual calculation).
  - Payment advice PDF auto-generated with all required fields pre-filled (CPIN, BSR code, etc.).

- **Build status:** Partial (basic vat-payments CRUD exists — extend schema, add liability computation, adjustments, audit hash).

---

## Architecture Summary

| Layer | Pattern |
|---|---|
| Tax calculation | Pluggable `TaxEngine` interface; one plugin per region family |
| API | Contract-first OpenAPI 3.1 → Orval → TanStack Query; all mutations follow mutate-then-SELECT |
| DB | Drizzle on MariaDB/MySQL; `decimal` for all monetary/rate fields; `json` for payloads; no FKs |
| Audit | Every filing, payment, adjustment, and rate change hash-chained in the existing tamper-evident ledger |
| External APIs | GSTN/IRP/e-way bill (India), HMRC MTD (UK), ZATCA Fatoorah (KSA), FTA EmaraTax (UAE), Avalara AvaTax (US), VIES (EU VAT validation), TRACES (TDS Form 26AS) |
| Jobs | Async queues for IRN generation, GSTR-2B pull, OSS aggregation, exemption expiry alerts, rate sync |
| UX | shadcn/ui components; TanStack Query for optimistic updates; tax breakdown shown in real-time as line items are edited |

---

*Generated: 2026-07-01 | Blueprint section: 06-taxes-compliance*


---

## 7. Reports & Dashboard

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


---

## 8. Platform: Automation, Workflows, Integrations & Admin

This section covers the cross-cutting platform engines that every other module depends on. Four shared runtimes underpin everything: an **event bus** (every DB mutation emits a typed domain event), a **rule engine** (evaluates workflow rules against each event in memory), a **scheduler** (node-cron for simple recurrence; BullMQ+Redis for durable, retryable jobs), and a **notification/webhook dispatcher** (fan-out delivery with retry, back-off, and signing). Because MariaDB has no `RETURNING` clause, every mutate operation follows the pattern: `INSERT`/`UPDATE` → re-`SELECT` by primary key → return hydrated record. The existing tamper-evident, SHA-256 hash-chained audit ledger (`audit_log` table + middleware) is the compliance backbone: every write anywhere in the platform is already captured, so "audit trail" is not a feature to build—it is a guarantee to expose and extend.

**Sub-features covered:**
- 8.1 Workflow Rules
- 8.2 Custom Functions / Scripting Sandbox
- 8.3 Schedules & Recurring Automation Engine
- 8.4 Email / SMS Notifications & Reminders
- 8.5 Webhooks (Outbound)
- 8.6 Developer / API Platform
- 8.7 Approval Workflows
- 8.8 Users, Roles & Permissions (RBAC)
- 8.9 Organizations, Multi-Branch & Multi-Currency Base
- 8.10 Custom Fields, Custom Views, Tags & Custom Modules
- 8.11 Documents, Attachments & OCR Inbox
- 8.12 Client Portal
- 8.13 Vendor Portal
- 8.14 Projects & Timesheets
- 8.15 Audit Trail (Ledger Integration)
- 8.16 Integrations (Payment Gateways, Bank Feeds, Ecosystem, Import/Export)

---

### 8.1 Workflow Rules

- **Purpose:** Event-driven automation that fires field updates, emails, webhooks, or custom functions when a record is created, edited, or a date-based condition fires.

- **Zoho Books behaviour:**
  - Triggers: event-based (Created / Edited / Created or Edited) or date-based (e.g., "3 days before due date").
  - Conditions: up to 10 criteria per rule with AND / OR logic; criteria can check any field on the record.
  - Actions per rule: up to 5 email alerts, up to 3 field updates, 1 webhook, 1 custom function (Deluge), in-app notifications.
  - Hard daily limits: 500 email alerts / 500 webhooks per organisation.
  - Modules: Sales, Purchases, Time Tracking, Contacts, Banking, Journals, Items, Inventory, Tasks, Custom Modules.
  - Rules can be reordered, cloned, deactivated, deleted.

- **Data model:**

```ts
// drizzle-orm/mysql2 — no FKs, int autoincrement PKs, custom json type, decimal, text, timestamp

export const workflowRules = mysqlTable('workflow_rules', {
  id:           int('id').autoincrement().primaryKey(),
  orgId:        int('org_id').notNull(),
  name:         text('name').notNull(),
  module:       text('module').notNull(),            // 'invoice'|'bill'|'contact'|...
  triggerOn:    text('trigger_on').notNull(),        // 'create'|'edit'|'create_or_edit'|'date'
  dateField:    text('date_field'),                  // e.g. 'due_date' for date-based
  dateOffset:   int('date_offset'),                  // days before(-) or after(+)
  conditionLogic: text('condition_logic').notNull(), // 'AND'|'OR'
  conditions:   json('conditions').notNull(),        // WorkflowCondition[]
  active:       int('active').notNull().default(1),
  sortOrder:    int('sort_order').notNull().default(0),
  createdAt:    timestamp('created_at').defaultNow(),
  updatedAt:    timestamp('updated_at').defaultNow().onUpdateNow(),
});

// WorkflowCondition (stored in json column):
// { field: string; operator: 'eq'|'neq'|'gt'|'lt'|'contains'|'is_empty'|...; value: unknown }

export const workflowActions = mysqlTable('workflow_actions', {
  id:           int('id').autoincrement().primaryKey(),
  ruleId:       int('rule_id').notNull(),
  actionType:   text('action_type').notNull(), // 'email_alert'|'field_update'|'webhook'|'function'|'notification'
  timing:       text('timing').notNull(),      // 'immediate'|'delayed'
  delayMinutes: int('delay_minutes'),
  config:       json('config').notNull(),      // type-specific payload (see below)
  sortOrder:    int('sort_order').notNull().default(0),
});
// config examples:
//  email_alert  → { templateId, recipientType: 'contact'|'user'|'custom', emails: [] }
//  field_update → { field: string; value: unknown }
//  webhook      → { webhookId: number }
//  function     → { functionId: number; params: Record<string,unknown> }
```

- **API (contract-first):**

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/api/workflow-rules` | List rules; filters: `?module=invoice&active=1` |
| `POST`   | `/api/workflow-rules` | Create rule → INSERT then SELECT |
| `GET`    | `/api/workflow-rules/:id` | Single rule with actions |
| `PUT`    | `/api/workflow-rules/:id` | Full update → UPDATE then SELECT |
| `PATCH`  | `/api/workflow-rules/:id/toggle` | Activate / deactivate |
| `DELETE` | `/api/workflow-rules/:id` | Soft-delete (set active=0) |
| `POST`   | `/api/workflow-rules/:id/actions` | Add action to rule |
| `PUT`    | `/api/workflow-rules/:id/actions/:actionId` | Update action |
| `DELETE` | `/api/workflow-rules/:id/actions/:actionId` | Remove action |
| `POST`   | `/api/workflow-rules/reorder` | Bulk sort_order update |

Request body (create): `{ name, module, triggerOn, conditions[], conditionLogic, actions[] }`.
Response: `{ rule: WorkflowRule & { actions: WorkflowAction[] } }`. Zod schema enforces ≤10 conditions, ≤5 email actions, ≤3 field-update actions, ≤1 webhook action, ≤1 function action per rule.

- **Automations / engine design:**

```
DB Write → Express middleware emits domain event (EventEmitter / Redis pub/sub)
                ↓
        RuleEngine.evaluate(event)
          • loads active rules for module from cache (TTL 30 s, invalidate on rule change)
          • evaluates each rule's conditions against the record snapshot
          • for matching rules: enqueues each action into BullMQ "workflow-actions" queue
                ↓
        WorkflowActionWorker (BullMQ)
          • email_alert   → NotificationService
          • field_update  → DB UPDATE then SELECT (no RETURNING)
          • webhook       → WebhookDispatcher
          • function      → SandboxRunner
          • notification  → in-app NotificationService
        Retries: 3 attempts, exponential back-off 1 s → 4 s → 16 s
```

Date-based rules: a nightly BullMQ cron job scans all date-based rules, computes which records cross the date threshold that day, and enqueues matching actions.

- **Personalized / better-than-Zoho:**
  - Natural-language rule builder: describe the rule in plain English ("Send a reminder email 3 days before the invoice due date if the invoice is unpaid and over $500"), Claude parses it into a structured condition + action set.
  - No 500/day email cap — rate limiting is per-recipient, not per-org.
  - Rules can chain: action of type `trigger_rule` fires another rule by ID, enabling multi-step workflows without Deluge.
  - Real-time rule evaluation status visible in UI (last triggered, last failed, success rate).

- **Build status:** New — event bus stub exists in Express middleware; rule engine and action queue not yet implemented.

---

### 8.2 Custom Functions / Scripting Sandbox

- **Purpose:** Allow users to write imperative automation logic that goes beyond declarative field-update or email actions.

- **Zoho Books behaviour:**
  - Deluge (Data Enriched Language for the Universal Grid Environment) is Zoho's proprietary scripting language; also supports Node.js, Python, Java, Go via Zoho Finance CLI.
  - Scripts access 13+ predefined modules via Zoho connections; can call external HTTP endpoints.
  - Triggered by workflow rules or schedules; receive the triggering record as input params.
  - No sandboxing model documented; runs server-side in Zoho's infra.

- **Data model:**

```ts
export const customFunctions = mysqlTable('custom_functions', {
  id:          int('id').autoincrement().primaryKey(),
  orgId:       int('org_id').notNull(),
  name:        text('name').notNull(),
  description: text('description'),
  language:    text('language').notNull().default('js'), // 'js' only in v1
  code:        text('code').notNull(),                   // source code
  inputSchema: json('input_schema'),                     // JSONSchema for params
  timeout:     int('timeout').notNull().default(5000),   // ms, max 30000
  active:      int('active').notNull().default(1),
  createdAt:   timestamp('created_at').defaultNow(),
  updatedAt:   timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const functionRuns = mysqlTable('function_runs', {
  id:          int('id').autoincrement().primaryKey(),
  functionId:  int('function_id').notNull(),
  triggeredBy: text('triggered_by').notNull(), // 'workflow_rule'|'schedule'|'manual'
  sourceId:    int('source_id'),               // ruleId or scheduleId
  input:       json('input'),
  output:      json('output'),
  status:      text('status').notNull(),       // 'pending'|'running'|'success'|'error'|'timeout'
  errorMsg:    text('error_msg'),
  durationMs:  int('duration_ms'),
  startedAt:   timestamp('started_at'),
  finishedAt:  timestamp('finished_at'),
  createdAt:   timestamp('created_at').defaultNow(),
});
```

- **API (contract-first):**

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/api/custom-functions` | List; filter `?active=1` |
| `POST`   | `/api/custom-functions` | Create → INSERT then SELECT |
| `GET`    | `/api/custom-functions/:id` | Single function |
| `PUT`    | `/api/custom-functions/:id` | Update code/schema |
| `DELETE` | `/api/custom-functions/:id` | Soft-delete |
| `POST`   | `/api/custom-functions/:id/run` | Manual test execution; body: `{ input }` |
| `GET`    | `/api/custom-functions/:id/runs` | Execution history; `?limit&offset&status` |

- **Automations / engine design:**

Use **isolated-vm** (V8 isolate, no Node APIs) for safe JS execution:
```
SandboxRunner.run(functionId, input):
  1. Load code from DB (or 30 s in-process cache)
  2. Create new Isolate (memoryLimitMb: 64)
  3. Inject safe built-ins: fetch (allowlisted URLs only), Books SDK (read/write via internal API calls with org token), console
  4. Enforce timeout (default 5 s, configurable up to 30 s)
  5. Capture output (return value, console.log lines)
  6. INSERT into function_runs, then SELECT — no RETURNING
  7. Append audit_log entry via audit middleware
```

The Books SDK injected into the sandbox exposes typed methods: `books.invoices.get(id)`, `books.invoices.update(id, patch)`, etc. — these are internal Express calls authenticated with an internal service token, not external API calls.

- **Personalized / better-than-Zoho:**
  - AI-assisted function writing: describe what the function should do, Claude generates the JS code using the Books SDK.
  - No proprietary language (Deluge) — standard JavaScript with familiar patterns.
  - Full execution log with timing, input/output, error stack trace, linked to audit_log entries.
  - Function versioning: store code history as JSON array; rollback by ID.

- **Build status:** New.

---

### 8.3 Schedules & Recurring Automation Engine

- **Purpose:** Two distinct systems: (a) user-defined custom schedules (run a function or action at an interval), (b) the system recurring engine that mints child invoices/bills/expenses/journals from profile records.

- **Zoho Books behaviour:**
  - Custom schedules: max 10 per org; intervals daily/weekly/monthly/yearly; start date, end date, Deluge function body; max start date 1 year from creation.
  - Recurring invoices: child invoices generated at 6 AM org timezone daily; modes: Draft / Auto-approve+Send / Auto-approve+Charge+Send; supports pause/resume; frequency: daily, weekly, biweekly, monthly, quarterly, semi-annual, annual, custom.
  - Recurring bills, recurring expenses, recurring journals follow identical profile+child pattern.

- **Data model:**

```ts
// User-defined schedules
export const automationSchedules = mysqlTable('automation_schedules', {
  id:          int('id').autoincrement().primaryKey(),
  orgId:       int('org_id').notNull(),
  name:        text('name').notNull(),
  cronExpr:    text('cron_expr').notNull(),   // standard 5-field cron
  functionId:  int('function_id'),            // optional custom function
  actionConfig: json('action_config'),        // if no function: declarative actions
  active:      int('active').notNull().default(1),
  startAt:     timestamp('start_at'),
  endAt:       timestamp('end_at'),
  lastRunAt:   timestamp('last_run_at'),
  nextRunAt:   timestamp('next_run_at'),
  createdAt:   timestamp('created_at').defaultNow(),
});

// Recurring profiles (all entity types share structure; entityType discriminates)
// Note: recurring_invoices, recurring_bills, recurring_expenses, recurring_journals
// already exist as records in the DB per system context — no runner yet.
export const recurringProfiles = mysqlTable('recurring_profiles', {
  id:           int('id').autoincrement().primaryKey(),
  orgId:        int('org_id').notNull(),
  entityType:   text('entity_type').notNull(),   // 'invoice'|'bill'|'expense'|'journal'
  name:         text('name').notNull(),
  templateData: json('template_data').notNull(), // the "parent" record snapshot
  frequency:    text('frequency').notNull(),      // 'daily'|'weekly'|'monthly'|'quarterly'|'yearly'|'custom'
  customDays:   int('custom_days'),
  automationMode: text('automation_mode').notNull().default('draft'),
  // 'draft' | 'approve_send' | 'approve_charge_send'
  nextRunAt:    timestamp('next_run_at').notNull(),
  endAt:        timestamp('end_at'),
  status:       text('status').notNull().default('active'), // 'active'|'paused'|'expired'
  paymentMethodId: int('payment_method_id'),  // for approve_charge_send
  createdAt:    timestamp('created_at').defaultNow(),
  updatedAt:    timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const recurringChildren = mysqlTable('recurring_children', {
  id:          int('id').autoincrement().primaryKey(),
  profileId:   int('profile_id').notNull(),
  entityType:  text('entity_type').notNull(),
  entityId:    int('entity_id').notNull(),   // ID of the created invoice/bill/etc.
  generatedAt: timestamp('generated_at').defaultNow(),
  status:      text('status').notNull(),     // 'draft'|'sent'|'paid'|'voided'
});
```

- **API (contract-first):**

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/api/automation-schedules` | List custom schedules |
| `POST`   | `/api/automation-schedules` | Create → INSERT then SELECT; max 10 per org validated |
| `PUT`    | `/api/automation-schedules/:id` | Update |
| `PATCH`  | `/api/automation-schedules/:id/toggle` | Activate / pause |
| `DELETE` | `/api/automation-schedules/:id` | Delete |
| `GET`    | `/api/recurring-profiles` | List; `?entityType=invoice&status=active` |
| `POST`   | `/api/recurring-profiles` | Create profile → INSERT then SELECT |
| `GET`    | `/api/recurring-profiles/:id` | Profile + child summary |
| `PUT`    | `/api/recurring-profiles/:id` | Update template/schedule |
| `PATCH`  | `/api/recurring-profiles/:id/pause` | Pause / resume |
| `POST`   | `/api/recurring-profiles/:id/run-now` | Manual child generation |
| `GET`    | `/api/recurring-profiles/:id/children` | Child entity list |

- **Automations / engine design:**

```
Scheduler layer (BullMQ repeatable jobs, backed by Redis):

1. RecurringProfileWorker — runs every minute:
   SELECT * FROM recurring_profiles
     WHERE status='active' AND next_run_at <= NOW()
   For each profile:
     a. BEGIN (logical, not SQL transaction — MariaDB no RETURNING)
     b. Clone templateData → create child entity (INSERT then SELECT)
     c. INSERT recurring_children row
     d. Apply automationMode:
          draft           → leave as draft, notify creator
          approve_send    → UPDATE status='approved', email to contact
          approve_charge_send → charge saved payment method via Stripe SDK,
                               UPDATE paid_at, email receipt
     e. Compute nextRunAt from frequency
     f. UPDATE recurring_profiles SET next_run_at=?, last_run_at=NOW()
     g. Audit log appended automatically via middleware

2. AutomationScheduleWorker — BullMQ job per schedule:
   On fire: execute associated custom function or declarative actions
   On finish: UPDATE last_run_at, compute next based on cron_expr

3. DateBasedWorkflowWorker — daily 00:05 org-timezone:
   Evaluate all date-based workflow rules, enqueue matching actions
```

node-cron: use for lightweight single-process scenarios (dev / small install). BullMQ+Redis: production default — survives restarts, supports concurrency, provides job dashboard.

- **Personalized / better-than-Zoho:**
  - No 10-schedule limit — enforce by plan tier, not hard cap.
  - Smart schedule suggestions: after user creates 3 recurring invoices for same customer, AI suggests consolidating into a single profile.
  - Dry-run mode: show preview of what the next child invoice/bill/journal will look like before enabling.
  - Schedule health dashboard: last run status, failure count, next-run countdown per profile.

- **Build status:** Profile records exist; **runner not yet implemented** (this is the primary deliverable for this sub-feature).

---

### 8.4 Email / SMS Notifications & Reminders

- **Purpose:** Transactional emails (invoice sent, payment received), automated payment reminders, configurable SMS alerts, and digest summaries.

- **Zoho Books behaviour:**
  - Email templates per module (Invoice, Bill, Payment, Quote, PO, Statement, etc.); customizable subject + body with `${FIELD}` placeholders.
  - Payment reminders: send N days before due, on due date, N days after due; configurable per customer; can send to multiple contacts.
  - Automatic payment reminders can be globally enabled/disabled.
  - SMS via 3rd-party gateways (Bulk SMS, SMS-Magic, Text Local) configured as webhooks.
  - Max 500 email alerts/day via workflow rules; no stated limit on direct invoice emails.
  - CC/BCC support; attach PDF automatically.

- **Data model:**

```ts
export const emailTemplates = mysqlTable('email_templates', {
  id:        int('id').autoincrement().primaryKey(),
  orgId:     int('org_id').notNull(),
  module:    text('module').notNull(),          // 'invoice'|'bill'|'payment'|'quote'|...
  name:      text('name').notNull(),
  isDefault: int('is_default').notNull().default(0),
  subject:   text('subject').notNull(),         // supports {{variable}} placeholders
  bodyHtml:  text('body_html').notNull(),
  bodyText:  text('body_text'),
  attachPdf: int('attach_pdf').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const paymentReminders = mysqlTable('payment_reminders', {
  id:           int('id').autoincrement().primaryKey(),
  orgId:        int('org_id').notNull(),
  name:         text('name').notNull(),
  triggerType:  text('trigger_type').notNull(), // 'before_due'|'on_due'|'after_due'
  dayOffset:    int('day_offset').notNull(),     // 0 = on due date
  templateId:   int('template_id').notNull(),
  active:       int('active').notNull().default(1),
  sendToAll:    int('send_to_all').notNull().default(1), // or per-customer override
  createdAt:    timestamp('created_at').defaultNow(),
});

export const notificationLog = mysqlTable('notification_log', {
  id:          int('id').autoincrement().primaryKey(),
  orgId:       int('org_id').notNull(),
  channel:     text('channel').notNull(),      // 'email'|'sms'|'in_app'
  recipient:   text('recipient').notNull(),
  subject:     text('subject'),
  templateId:  int('template_id'),
  entityType:  text('entity_type'),
  entityId:    int('entity_id'),
  status:      text('status').notNull(),       // 'queued'|'sent'|'failed'|'bounced'
  externalId:  text('external_id'),            // provider message ID
  sentAt:      timestamp('sent_at'),
  errorMsg:    text('error_msg'),
  createdAt:   timestamp('created_at').defaultNow(),
});
```

- **API (contract-first):**

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/api/email-templates` | List; `?module=invoice` |
| `POST`   | `/api/email-templates` | Create template |
| `PUT`    | `/api/email-templates/:id` | Update |
| `DELETE` | `/api/email-templates/:id` | Delete (cannot delete default) |
| `POST`   | `/api/email-templates/:id/preview` | Render with sample data; returns HTML |
| `GET`    | `/api/payment-reminders` | List reminder schedules |
| `POST`   | `/api/payment-reminders` | Create |
| `PUT`    | `/api/payment-reminders/:id` | Update |
| `DELETE` | `/api/payment-reminders/:id` | Delete |
| `GET`    | `/api/notification-log` | Delivery log; `?channel=email&status=failed&from=DATE` |

- **Automations / engine design:**

```
NotificationService (internal):
  send({ channel, recipient, templateId, context }):
    1. Render template with context (Handlebars / mustache)
    2. Enqueue in BullMQ "notifications" queue
    3. INSERT notification_log (status='queued') then SELECT
    NotificationWorker:
      email  → Nodemailer + SMTP (configurable; default SendGrid)
      sms    → Twilio / configurable provider REST call
      in_app → INSERT into in_app_notifications table, push via SSE/WebSocket

PaymentReminderWorker (daily, org-timezone morning):
  SELECT all open invoices where due_date matches any active reminder's trigger window
  For each: call NotificationService with invoice context + template
  UPDATE notification_log status after delivery
```

- **Personalized / better-than-Zoho:**
  - AI-drafted reminder copy: "write a polite but firm reminder for invoices 14 days overdue."
  - Delivery status shown inline on invoice detail (Sent ✓, Viewed ✓, Bounced ✗) using webhook callbacks from email provider.
  - Smart suppression: don't send reminder if customer paid in last 24 h (race condition guard).
  - Digest emails: daily/weekly "here is what happened" summary to org admin.

- **Build status:** New — email sending partially wired for invoice send; template system and reminder scheduler not yet built.

---

### 8.5 Webhooks (Outbound)

- **Purpose:** Push real-time event notifications to external systems when records are created, updated, or change state.

- **Zoho Books behaviour:**
  - Webhooks configured only via workflow rules UI (one webhook per rule); no API-based subscription endpoint.
  - Supports POST, PUT, DELETE HTTP methods to target URL.
  - Secret token for HMAC-SHA256 verification (sent as header).
  - Custom headers and multiple body formats: default JSON payload, form-data, x-www-urlencoded, raw.
  - Max 500 webhook triggers/day per org.
  - No documented retry mechanism; no documented delivery log.

- **Data model:**

```ts
export const webhookEndpoints = mysqlTable('webhook_endpoints', {
  id:          int('id').autoincrement().primaryKey(),
  orgId:       int('org_id').notNull(),
  name:        text('name').notNull(),
  url:         text('url').notNull(),
  secret:      text('secret').notNull(),          // stored encrypted; used for HMAC-SHA256
  events:      json('events').notNull(),           // string[]: ['invoice.created','payment.received',...]
  httpMethod:  text('http_method').notNull().default('POST'),
  headers:     json('headers'),                   // Record<string,string>
  active:      int('active').notNull().default(1),
  createdAt:   timestamp('created_at').defaultNow(),
  updatedAt:   timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const webhookDeliveries = mysqlTable('webhook_deliveries', {
  id:              int('id').autoincrement().primaryKey(),
  endpointId:      int('endpoint_id').notNull(),
  event:           text('event').notNull(),
  entityType:      text('entity_type').notNull(),
  entityId:        int('entity_id').notNull(),
  payload:         json('payload').notNull(),
  status:          text('status').notNull(),   // 'pending'|'delivered'|'failed'|'retrying'
  attemptCount:    int('attempt_count').notNull().default(0),
  lastAttemptAt:   timestamp('last_attempt_at'),
  nextAttemptAt:   timestamp('next_attempt_at'),
  responseStatus:  int('response_status'),
  responseBody:    text('response_body'),
  errorMsg:        text('error_msg'),
  createdAt:       timestamp('created_at').defaultNow(),
});
```

- **API (contract-first):**

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/api/webhooks` | List endpoints; `?active=1` |
| `POST`   | `/api/webhooks` | Create endpoint → INSERT then SELECT; auto-generates secret |
| `GET`    | `/api/webhooks/:id` | Single endpoint (secret masked) |
| `PUT`    | `/api/webhooks/:id` | Update URL / events / headers |
| `PATCH`  | `/api/webhooks/:id/toggle` | Enable / disable |
| `DELETE` | `/api/webhooks/:id` | Delete |
| `POST`   | `/api/webhooks/:id/test` | Fire a test ping to the URL |
| `GET`    | `/api/webhooks/:id/deliveries` | Delivery log; `?status=failed&limit=50` |
| `POST`   | `/api/webhooks/deliveries/:deliveryId/retry` | Manual retry |

- **Workflow / state machine:**

```
pending → [attempt] → delivered  (2xx response)
                   ↘ failed      (non-2xx or timeout, attempts exhausted)
                   ↘ retrying    (non-2xx, attempts remaining, next_attempt_at set)
```

- **Automations / engine design:**

```
WebhookDispatcher.dispatch(event, entity):
  1. SELECT active endpoints WHERE events JSON contains event
  2. For each endpoint:
     a. Build payload: { event, entityType, entityId, data: entity, timestamp, deliveryId }
     b. Sign: X-Astram-Signature: sha256=HMAC-SHA256(secret, JSON.stringify(payload))
     c. INSERT webhook_deliveries (status='pending') then SELECT → get deliveryId
     d. Enqueue BullMQ "webhook-delivery" job with deliveryId
  WebhookDeliveryWorker:
     Fetch delivery row; POST to endpoint URL (timeout 10 s)
     On 2xx: UPDATE status='delivered', responseStatus, responseBody
     On error: increment attemptCount; if < 5: UPDATE status='retrying', nextAttemptAt (1m, 5m, 30m, 2h, 6h)
               else: UPDATE status='failed'
```

- **Personalized / better-than-Zoho:**
  - API-based webhook subscription (no UI-only restriction like Zoho).
  - Full delivery log with request/response headers, body, timing — inline on endpoint detail page.
  - Programmatic retry; bulk retry all failed deliveries for an endpoint.
  - Event catalogue UI: browse all event types with example payloads.
  - No artificial 500/day cap.

- **Build status:** New.

---

### 8.6 Developer / API Platform

- **Purpose:** Expose a stable, versioned REST API that third-party developers and Astram ecosystem modules can consume securely.

- **Zoho Books behaviour:**
  - OAuth 2.0 (authorization code + refresh token); access tokens expire in 1 h; 20 refresh tokens max per user.
  - Scopes are module + action: `ZohoBooks.invoices.CREATE`, `ZohoBooks.contacts.READ`.
  - Rate limits: 100 req/min/org; daily limits 1k–10k by plan tier; 5–10 concurrent.
  - Offset-based pagination (`page`, `per_page` max 200); `has_more_page` in response.
  - `organization_id` query param required on every call.
  - No idempotency key mechanism documented; no `Retry-After` header on 429.
  - No programmatic webhook subscription.
  - Regional API domain per data center.

- **Data model:**

```ts
export const apiClients = mysqlTable('api_clients', {
  id:           int('id').autoincrement().primaryKey(),
  orgId:        int('org_id').notNull(),
  name:         text('name').notNull(),
  clientId:     text('client_id').notNull(),      // UUID, unique
  clientSecret: text('client_secret').notNull(),  // hashed (bcrypt)
  redirectUris: json('redirect_uris').notNull(),
  scopes:       json('scopes').notNull(),         // allowed scope strings[]
  active:       int('active').notNull().default(1),
  createdAt:    timestamp('created_at').defaultNow(),
});

export const apiKeys = mysqlTable('api_keys', {
  id:          int('id').autoincrement().primaryKey(),
  orgId:       int('org_id').notNull(),
  userId:      int('user_id').notNull(),
  name:        text('name').notNull(),
  keyHash:     text('key_hash').notNull(),   // SHA-256 of the raw key; raw shown once
  prefix:      text('prefix').notNull(),     // first 8 chars for display: "astm_XXXX..."
  scopes:      json('scopes').notNull(),
  lastUsedAt:  timestamp('last_used_at'),
  expiresAt:   timestamp('expires_at'),
  active:      int('active').notNull().default(1),
  createdAt:   timestamp('created_at').defaultNow(),
});

export const oauthTokens = mysqlTable('oauth_tokens', {
  id:            int('id').autoincrement().primaryKey(),
  clientId:      int('client_id').notNull(),
  userId:        int('user_id').notNull(),
  orgId:         int('org_id').notNull(),
  accessToken:   text('access_token').notNull(),    // hashed
  refreshToken:  text('refresh_token').notNull(),   // hashed
  scopes:        json('scopes').notNull(),
  accessExpiry:  timestamp('access_expiry').notNull(),
  refreshExpiry: timestamp('refresh_expiry'),
  revokedAt:     timestamp('revoked_at'),
  createdAt:     timestamp('created_at').defaultNow(),
});

export const apiRateLimits = mysqlTable('api_rate_limits', {
  id:        int('id').autoincrement().primaryKey(),
  orgId:     int('org_id').notNull(),
  window:    text('window').notNull(),   // '1m'|'1d'
  count:     int('count').notNull().default(0),
  resetAt:   timestamp('reset_at').notNull(),
});
```

- **API (contract-first):**

| Method | Path | Description |
|--------|------|-------------|
| `POST`   | `/api/oauth/authorize` | Begin authorization code flow |
| `POST`   | `/api/oauth/token` | Exchange code for tokens; refresh token grant |
| `POST`   | `/api/oauth/revoke` | Revoke access or refresh token |
| `GET`    | `/api/api-clients` | List OAuth apps for org |
| `POST`   | `/api/api-clients` | Register new app |
| `PUT`    | `/api/api-clients/:id` | Update redirect URIs, scopes |
| `DELETE` | `/api/api-clients/:id` | Delete app (revokes all tokens) |
| `GET`    | `/api/api-keys` | List API keys (prefix + metadata only) |
| `POST`   | `/api/api-keys` | Create key → returns raw key once, INSERT then SELECT |
| `DELETE` | `/api/api-keys/:id` | Revoke key |
| `GET`    | `/api/developer/usage` | Rate limit counters for the calling key/token |
| `GET`    | `/api/developer/events` | Event catalogue (all webhook event types + schemas) |

**Rate limiting:** sliding window in Redis. Headers returned: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (epoch), `Retry-After` on 429 (unlike Zoho, which omits it).

**Idempotency:** all `POST` endpoints accept `Idempotency-Key: <uuid>` header; responses cached in Redis for 24 h; duplicate requests return the original response with `X-Idempotent-Replayed: true`.

**Pagination:** cursor-based (`?cursor=<opaque>&limit=50`, default 50, max 200) in addition to offset (`?page=1&per_page=200`) for backward compat. Response envelope:
```json
{ "data": [], "meta": { "total": 1240, "cursor": "eyJpZCI6NDJ9", "hasMore": true } }
```

**OpenAPI 3.1 → Orval → TanStack Query + Zod:** every endpoint defined in `/openapi/astram.yaml`; Orval generates typed React Query hooks and Zod validators automatically.

- **Personalized / better-than-Zoho:**
  - API keys (simpler than OAuth for server-to-server; Zoho has no API key mechanism).
  - `Retry-After` header on 429 (Zoho omits it).
  - Idempotency keys on all mutating endpoints.
  - Cursor-based pagination (Zoho is offset-only, which misses records under concurrent writes).
  - Programmatic webhook subscription via API.
  - Developer portal UI: live API explorer (Swagger UI), key management, usage graphs, event catalogue.
  - Scopes auto-suggested based on the app's description (AI).

- **Build status:** Express 5 API exists; OAuth and API key auth not yet implemented.

---

### 8.7 Approval Workflows

- **Purpose:** Multi-step submit → approve → reject flows for invoices, POs, bills, credit notes, sales orders, quotes, manual journals, inventory adjustments.

- **Zoho Books behaviour:**
  - Three modes: Simple (any one admin/approver), Multi-Level (sequential levels, each requiring sign-off), Custom (criteria-based routing).
  - "Final Approve" allows admin override of hierarchy.
  - Bulk approval from list view.
  - States: Draft → Pending Approval → Approved / Rejected.
  - Rejected transactions can be corrected and resubmitted.
  - Approval history with actor + timestamp + reason on each record.
  - Email and in-app notifications to approvers on submission; to submitter on decision.
  - Timesheet entries have their own approval flow (internal staff approval + optional customer approval).

- **Data model:**

```ts
export const approvalPolicies = mysqlTable('approval_policies', {
  id:         int('id').autoincrement().primaryKey(),
  orgId:      int('org_id').notNull(),
  module:     text('module').notNull(),        // 'invoice'|'bill'|'purchase_order'|'journal'|...
  mode:       text('mode').notNull(),          // 'simple'|'multi_level'|'custom'
  levels:     json('levels').notNull(),        // ApprovalLevel[]
  // ApprovalLevel: { levelNum: int; approverUserIds: int[]; requireAll: boolean }
  conditions: json('conditions'),              // for 'custom' mode: WorkflowCondition[]
  active:     int('active').notNull().default(1),
  createdAt:  timestamp('created_at').defaultNow(),
  updatedAt:  timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const approvalRequests = mysqlTable('approval_requests', {
  id:            int('id').autoincrement().primaryKey(),
  orgId:         int('org_id').notNull(),
  policyId:      int('policy_id').notNull(),
  module:        text('module').notNull(),
  entityId:      int('entity_id').notNull(),
  submittedBy:   int('submitted_by').notNull(),
  currentLevel:  int('current_level').notNull().default(1),
  status:        text('status').notNull(),    // 'pending'|'approved'|'rejected'
  createdAt:     timestamp('created_at').defaultNow(),
  updatedAt:     timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const approvalDecisions = mysqlTable('approval_decisions', {
  id:          int('id').autoincrement().primaryKey(),
  requestId:   int('request_id').notNull(),
  actorUserId: int('actor_user_id').notNull(),
  level:       int('level').notNull(),
  decision:    text('decision').notNull(),    // 'approved'|'rejected'|'final_approved'
  reason:      text('reason'),
  decidedAt:   timestamp('decided_at').defaultNow(),
});
```

- **API (contract-first):**

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/api/approval-policies` | List policies; `?module=invoice` |
| `POST`   | `/api/approval-policies` | Create policy |
| `PUT`    | `/api/approval-policies/:id` | Update |
| `DELETE` | `/api/approval-policies/:id` | Delete |
| `POST`   | `/api/:module/:id/submit` | Submit entity for approval → INSERT approval_request then SELECT |
| `POST`   | `/api/approvals/:requestId/approve` | Approve at current level; body: `{ reason? }` |
| `POST`   | `/api/approvals/:requestId/final-approve` | Admin override → approved regardless of level |
| `POST`   | `/api/approvals/:requestId/reject` | Reject; body: `{ reason }` required |
| `GET`    | `/api/approvals` | My pending approvals; `?module=invoice&status=pending` |
| `GET`    | `/api/approvals/:requestId/history` | Full decision log for a request |
| `POST`   | `/api/approvals/bulk-approve` | Body: `{ requestIds: int[] }` |

- **Workflow / state machine:**

```
entity.status: draft → pending_approval → approved
                                        ↘ rejected → draft (after edit) → pending_approval
approval_request.status mirrors entity.status

Multi-level flow:
  Submit → level 1 approvers notified
  Level 1 approved (all required) → level 2 approvers notified → ...
  Final level approved → entity.status = 'approved', emit 'invoice.approved' event
  Any level rejected → entity.status = 'rejected', notify submitter with reason
```

- **Automations / engine design:**
  - On `POST /submit`: evaluate which policy applies (check conditions for custom mode); create `approval_request`; enqueue notification to level-1 approvers.
  - On approve: INSERT decision row; check if all required approvers at this level approved; if yes → advance `currentLevel` or mark approved; emit domain event.
  - Entity status updates: UPDATE entity table (e.g., `invoices SET status='pending_approval'`) then SELECT — no RETURNING.
  - Audit ledger captures every approval decision automatically via middleware.

- **Personalized / better-than-Zoho:**
  - Approval request visible as a timeline on the entity detail page (not just a history log on a separate screen).
  - Slack / email deep-link: approver clicks link in email → lands on the approval decision page pre-authenticated.
  - AI-powered approval routing: natural language policy ("invoices over $10,000 need CFO sign-off; others need department head") parsed into a multi-level policy.
  - Delegation: if an approver is on leave, auto-delegate to their backup (configurable).

- **Build status:** New.

---

### 8.8 Users, Roles & Permissions (RBAC)

- **Purpose:** Control who can read, create, update, and delete records within each module; support accountant access with cross-org visibility.

- **Zoho Books behaviour:**
  - Built-in roles: Admin (full access), Staff (all modules except Reports/Settings), Timesheet Staff (timesheets only), Staff (Assigned Customers Only).
  - Custom roles: create with per-module permission levels (None / View / Create+Edit / Full).
  - Module-level segmentation: restrict by Location, Reporting Tag, Banking module.
  - Accountant role: cross-org access via Zoho Accountant portal; can manage multiple client orgs.
  - Users can be marked inactive; only admins can manage users.
  - Custom fields available on user profile (with PII flag).
  - Max users: plan-dependent.

- **Data model:**

```ts
export const roles = mysqlTable('roles', {
  id:          int('id').autoincrement().primaryKey(),
  orgId:       int('org_id').notNull(),
  name:        text('name').notNull(),
  description: text('description'),
  isSystem:    int('is_system').notNull().default(0), // 1 = built-in, cannot delete
  permissions: json('permissions').notNull(),          // ModulePermission[]
  // ModulePermission: { module: string; level: 'none'|'view'|'edit'|'full' }
  createdAt:   timestamp('created_at').defaultNow(),
  updatedAt:   timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const users = mysqlTable('users', {
  id:           int('id').autoincrement().primaryKey(),
  orgId:        int('org_id').notNull(),
  email:        text('email').notNull(),
  name:         text('name').notNull(),
  roleId:       int('role_id').notNull(),
  status:       text('status').notNull().default('active'),  // 'active'|'inactive'|'invited'
  isAccountant: int('is_accountant').notNull().default(0),
  segmentTags:  json('segment_tags'),    // { locationIds: int[], tagIds: int[] } access filters
  lastLoginAt:  timestamp('last_login_at'),
  createdAt:    timestamp('created_at').defaultNow(),
  updatedAt:    timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const userSessions = mysqlTable('user_sessions', {
  id:        int('id').autoincrement().primaryKey(),
  userId:    int('user_id').notNull(),
  token:     text('token').notNull(),     // hashed session token
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

- **API (contract-first):**

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/api/roles` | List roles for org |
| `POST`   | `/api/roles` | Create custom role |
| `PUT`    | `/api/roles/:id` | Update permissions |
| `DELETE` | `/api/roles/:id` | Delete (reject if has users) |
| `GET`    | `/api/users` | List users; `?status=active&roleId=X` |
| `POST`   | `/api/users/invite` | Invite user by email → INSERT (status='invited') then SELECT |
| `PUT`    | `/api/users/:id` | Update role, segment tags |
| `PATCH`  | `/api/users/:id/deactivate` | Set status='inactive' |
| `PATCH`  | `/api/users/:id/reactivate` | Set status='active' |
| `DELETE` | `/api/users/:id` | Hard delete (only if no activity) |
| `GET`    | `/api/users/me` | Current user + effective permissions |
| `GET`    | `/api/users/me/permissions` | Flat permission map for frontend gating |

- **Automations / engine design:**

Permission check middleware (runs before every route handler):
```ts
// permissionGuard(module: string, level: 'view'|'edit'|'full')
async (req, res, next) => {
  const user = req.user; // populated by auth middleware
  const role = await getRoleFromCache(user.roleId);
  const perm = role.permissions.find(p => p.module === module);
  if (!perm || levelRank[perm.level] < levelRank[level]) return res.status(403).json({ error: 'Forbidden' });
  // segment filter: attach WHERE clause for locationId / tagId to req for downstream query use
  next();
}
```

Roles cached in Redis (TTL 60 s, invalidated on role update).

- **Personalized / better-than-Zoho:**
  - Field-level permissions (hide specific fields from certain roles, e.g., hide cost price from sales staff).
  - Permission diff viewer: before saving a role, show a diff of what changed.
  - Accountant access: invite an accountant by email → they get a scoped view across orgs they're invited to; no separate portal required.
  - Time-limited access: grant a role until a specific date (e.g., external auditor access).

- **Build status:** Partial — users table and basic auth exist; roles and RBAC middleware not yet implemented.

---

### 8.9 Organizations, Multi-Branch & Multi-Currency Base

- **Purpose:** Manage org-level settings (fiscal year, base currency, timezone, transaction numbering), branch/location structure, and multi-currency exchange rates.

- **Zoho Books behaviour:**
  - Each Zoho account can have multiple independent organizations (separate Books orgs).
  - Within one org: Locations module for branches (available on higher-tier plans).
  - Base currency set at org creation (cannot be changed after transactions exist).
  - Multi-currency: enable per org; add foreign currencies with exchange rates (manual or auto-fetch); transactions record both foreign and base currency amounts.
  - Transaction number series: configurable prefix + sequence per module, can differ by branch.
  - Fiscal year: configurable start month.
  - Org logo, address, tax registration numbers stored at org level.

- **Data model:**

```ts
export const organizations = mysqlTable('organizations', {
  id:             int('id').autoincrement().primaryKey(),
  name:           text('name').notNull(),
  legalName:      text('legal_name'),
  baseCurrency:   text('base_currency').notNull().default('USD'),  // ISO 4217
  timezone:       text('timezone').notNull().default('UTC'),
  fiscalYearStart: int('fiscal_year_start').notNull().default(1),  // month 1-12
  address:        json('address'),           // { street, city, state, zip, country }
  taxRegistration: json('tax_registration'), // { gst?, pan?, ein?, vat? }
  logoUrl:        text('logo_url'),
  multiCurrencyEnabled: int('multi_currency_enabled').notNull().default(0),
  active:         int('active').notNull().default(1),
  plan:           text('plan').notNull().default('starter'),
  createdAt:      timestamp('created_at').defaultNow(),
  updatedAt:      timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const orgBranches = mysqlTable('org_branches', {
  id:       int('id').autoincrement().primaryKey(),
  orgId:    int('org_id').notNull(),
  name:     text('name').notNull(),
  code:     text('code'),
  address:  json('address'),
  active:   int('active').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow(),
});

export const currencies = mysqlTable('currencies', {
  id:           int('id').autoincrement().primaryKey(),
  orgId:        int('org_id').notNull(),
  code:         text('code').notNull(),        // ISO 4217
  name:         text('name').notNull(),
  symbol:       text('symbol').notNull(),
  exchangeRate: decimal('exchange_rate', { precision: 18, scale: 8 }).notNull(),
  isBase:       int('is_base').notNull().default(0),
  autoUpdate:   int('auto_update').notNull().default(0),
  updatedAt:    timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const txnNumberSeries = mysqlTable('txn_number_series', {
  id:       int('id').autoincrement().primaryKey(),
  orgId:    int('org_id').notNull(),
  branchId: int('branch_id'),            // null = all branches
  module:   text('module').notNull(),
  prefix:   text('prefix').notNull(),
  nextSeq:  int('next_seq').notNull().default(1),
  padding:  int('padding').notNull().default(4),  // INV-0001
});
```

- **API (contract-first):**

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/api/org` | Current org settings |
| `PUT`    | `/api/org` | Update org settings → UPDATE then SELECT |
| `GET`    | `/api/org/branches` | List branches |
| `POST`   | `/api/org/branches` | Create branch |
| `PUT`    | `/api/org/branches/:id` | Update |
| `GET`    | `/api/currencies` | List enabled currencies |
| `POST`   | `/api/currencies` | Add currency |
| `PUT`    | `/api/currencies/:id` | Update exchange rate |
| `POST`   | `/api/currencies/refresh-rates` | Pull live rates from open exchange rates API |
| `GET`    | `/api/txn-number-series` | List series by module |
| `PUT`    | `/api/txn-number-series/:id` | Update prefix / next seq |

- **Personalized / better-than-Zoho:**
  - Exchange rate history: store daily rates in `currency_rate_history` for accurate historical conversion in reports.
  - Multiple orgs under one login (handled at auth layer: `orgId` on every request; user can switch orgs from a top-level org switcher).
  - Branch-level P&L segmentation via reporting tags (branches + tags compose, no plan restriction).

- **Build status:** Organizations table exists; branches, multi-currency, txn series — New.

---

### 8.10 Custom Fields, Custom Views, Tags & Custom Modules

- **Purpose:** Extend the data model and list views without code changes; add reporting dimensions via tags.

- **Zoho Books behaviour:**
  - **Custom fields:** add fields to standard modules (Invoice, Contact, Item, etc.); types: text, number, decimal, date, dropdown, multi-select, URL, email, phone, checkbox, textarea; PII flag; required flag; API name.
  - **Custom views:** save filter + column + sort presets per module; shared or private.
  - **Reporting tags:** max 10 tags/org, 500 options each; applied at transaction or line-item level; parent-child option hierarchy for advanced segmentation; filter P&L and other reports by tag.
  - **Custom modules:** create entirely new record types with their own fields, list views, workflows, portal visibility, API access. Supports blueprints, layout rules, validation rules, custom buttons, analytics.

- **Data model:**

```ts
export const customFieldDefs = mysqlTable('custom_field_defs', {
  id:          int('id').autoincrement().primaryKey(),
  orgId:       int('org_id').notNull(),
  module:      text('module').notNull(),
  label:       text('label').notNull(),
  apiName:     text('api_name').notNull(),   // snake_case, used in API payloads
  fieldType:   text('field_type').notNull(), // 'text'|'number'|'decimal'|'date'|'dropdown'|'multiselect'|'checkbox'|'textarea'|'url'|'email'
  options:     json('options'),              // string[] for dropdown/multiselect
  required:    int('required').notNull().default(0),
  isPii:       int('is_pii').notNull().default(0),
  showInPortal: int('show_in_portal').notNull().default(0),
  sortOrder:   int('sort_order').notNull().default(0),
  active:      int('active').notNull().default(1),
  createdAt:   timestamp('created_at').defaultNow(),
});

export const customFieldValues = mysqlTable('custom_field_values', {
  id:         int('id').autoincrement().primaryKey(),
  orgId:      int('org_id').notNull(),
  fieldDefId: int('field_def_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId:   int('entity_id').notNull(),
  value:      json('value'),                 // stores any scalar or array
  updatedAt:  timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const savedViews = mysqlTable('saved_views', {
  id:         int('id').autoincrement().primaryKey(),
  orgId:      int('org_id').notNull(),
  module:     text('module').notNull(),
  name:       text('name').notNull(),
  ownerId:    int('owner_id').notNull(),
  isShared:   int('is_shared').notNull().default(0),
  filters:    json('filters').notNull(),    // FilterClause[]
  columns:    json('columns').notNull(),    // string[]
  sortField:  text('sort_field'),
  sortDir:    text('sort_dir'),             // 'asc'|'desc'
  createdAt:  timestamp('created_at').defaultNow(),
});

export const reportingTags = mysqlTable('reporting_tags', {
  id:        int('id').autoincrement().primaryKey(),
  orgId:     int('org_id').notNull(),
  name:      text('name').notNull(),
  parentId:  int('parent_id'),             // for hierarchical options
  active:    int('active').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow(),
});

export const reportingTagOptions = mysqlTable('reporting_tag_options', {
  id:       int('id').autoincrement().primaryKey(),
  tagId:    int('tag_id').notNull(),
  label:    text('label').notNull(),
  parentOptionId: int('parent_option_id'), // parent-child hierarchy
  active:   int('active').notNull().default(1),
});

export const entityTagAssignments = mysqlTable('entity_tag_assignments', {
  id:         int('id').autoincrement().primaryKey(),
  orgId:      int('org_id').notNull(),
  tagId:      int('tag_id').notNull(),
  optionId:   int('option_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId:   int('entity_id').notNull(),
  lineItemIdx: int('line_item_idx'),        // null = transaction level; >=0 = line item
  createdAt:  timestamp('created_at').defaultNow(),
});

// Custom Modules
export const customModuleDefs = mysqlTable('custom_module_defs', {
  id:        int('id').autoincrement().primaryKey(),
  orgId:     int('org_id').notNull(),
  name:      text('name').notNull(),
  apiSlug:   text('api_slug').notNull(),    // used in URL: /api/custom/:apiSlug
  fields:    json('fields').notNull(),      // CustomFieldDef[] (inlined, not FK)
  showInPortal: json('show_in_portal'),     // { customer: bool; vendor: bool }
  active:    int('active').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow(),
});

export const customModuleRecords = mysqlTable('custom_module_records', {
  id:       int('id').autoincrement().primaryKey(),
  orgId:    int('org_id').notNull(),
  moduleId: int('module_id').notNull(),
  data:     json('data').notNull(),         // { [apiName]: value }
  status:   text('status'),
  createdBy: int('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});
```

- **API (contract-first):**

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/api/custom-fields/:module` | List field defs for a module |
| `POST`   | `/api/custom-fields/:module` | Create field def |
| `PUT`    | `/api/custom-fields/:id` | Update |
| `DELETE` | `/api/custom-fields/:id` | Delete (cascade values) |
| `GET`    | `/api/saved-views/:module` | List views |
| `POST`   | `/api/saved-views/:module` | Create |
| `PUT`    | `/api/saved-views/:id` | Update |
| `DELETE` | `/api/saved-views/:id` | Delete |
| `GET`    | `/api/reporting-tags` | List tags + options |
| `POST`   | `/api/reporting-tags` | Create tag |
| `POST`   | `/api/reporting-tags/:id/options` | Add option |
| `GET`    | `/api/custom-modules` | List custom module defs |
| `POST`   | `/api/custom-modules` | Create module |
| `GET`    | `/api/custom/:apiSlug` | List records in custom module |
| `POST`   | `/api/custom/:apiSlug` | Create record → INSERT then SELECT |
| `GET`    | `/api/custom/:apiSlug/:id` | Single record |
| `PUT`    | `/api/custom/:apiSlug/:id` | Update |
| `DELETE` | `/api/custom/:apiSlug/:id` | Delete |

Custom field values returned as `customFields: { [apiName]: value }` on every entity response that has custom fields enabled.

- **Personalized / better-than-Zoho:**
  - Conditional field visibility (show field X only when field Y equals "Premium") as a layout rule, stored in `customFieldDefs.conditions` JSON.
  - Custom module records participate in workflow rules and webhooks identically to standard modules.
  - Reporting tags visualized as a filterable sidebar on list views, not just a report option.

- **Build status:** New.

---

### 8.11 Documents, Attachments & OCR Inbox

- **Purpose:** Centralised document storage; per-transaction file attachments; email-in inbox with OCR autoscan for bill/expense capture.

- **Zoho Books behaviour:**
  - Documents module: drag-and-drop upload, cloud import (Dropbox, Google Drive, OneDrive), email-in via a unique org email address.
  - Autoscan / OCR: extracts date, vendor, amount, line items from uploaded images and PDFs; supports 15 languages; suggested matches to existing transactions.
  - Bank statement auto-forward: Gmail/Outlook/Zoho Mail → configured folder.
  - Transaction matching: when creating a bill/expense/bank transaction, system suggests documents based on vendor name + date + amount.
  - Per-transaction attachments shown in customer portal when "Display attachment in portal" is enabled.
  - Free monthly scan quota; paid add-on for additional scans (~$8–10/month).
  - Folder organisation with folder-level permissions.

- **Data model:**

```ts
export const documents = mysqlTable('documents', {
  id:           int('id').autoincrement().primaryKey(),
  orgId:        int('org_id').notNull(),
  folderId:     int('folder_id'),
  fileName:     text('file_name').notNull(),
  fileSize:     int('file_size').notNull(),          // bytes
  mimeType:     text('mime_type').notNull(),
  storageKey:   text('storage_key').notNull(),        // S3/R2 object key
  source:       text('source').notNull(),             // 'upload'|'email'|'cloud'|'bank_statement'
  uploadedBy:   int('uploaded_by'),
  inboxStatus:  text('inbox_status').notNull().default('inbox'),
  // 'inbox'|'scanned'|'matched'|'archived'
  ocrStatus:    text('ocr_status').notNull().default('pending'),
  // 'pending'|'processing'|'complete'|'failed'
  ocrData:      json('ocr_data'),        // { date?, vendor?, amount?, lineItems?, confidence }
  createdAt:    timestamp('created_at').defaultNow(),
  updatedAt:    timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const documentFolders = mysqlTable('document_folders', {
  id:        int('id').autoincrement().primaryKey(),
  orgId:     int('org_id').notNull(),
  name:      text('name').notNull(),
  parentId:  int('parent_id'),
  access:    text('access').notNull().default('org'), // 'org'|'admin_only'|'role:<id>'
  createdAt: timestamp('created_at').defaultNow(),
});

export const documentAttachments = mysqlTable('document_attachments', {
  id:         int('id').autoincrement().primaryKey(),
  orgId:      int('org_id').notNull(),
  documentId: int('document_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId:   int('entity_id').notNull(),
  showInPortal: int('show_in_portal').notNull().default(0),
  attachedAt: timestamp('attached_at').defaultNow(),
  attachedBy: int('attached_by').notNull(),
});
```

- **API (contract-first):**

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/api/documents` | List; `?folderId=X&inboxStatus=inbox&ocrStatus=complete` |
| `POST`   | `/api/documents/upload` | Multipart upload → store to S3/R2, INSERT then SELECT |
| `DELETE` | `/api/documents/:id` | Delete doc + storage object |
| `PATCH`  | `/api/documents/:id/archive` | Move out of inbox |
| `POST`   | `/api/documents/:id/attach` | Attach to entity; body: `{ entityType, entityId, showInPortal }` |
| `DELETE` | `/api/document-attachments/:id` | Detach |
| `GET`    | `/api/documents/inbox` | Inbox with OCR suggestions |
| `POST`   | `/api/documents/:id/match` | Accept suggested match → merge with entity |
| `GET`    | `/api/document-folders` | List folders |
| `POST`   | `/api/document-folders` | Create folder |
| `GET`    | `/api/:entityType/:entityId/attachments` | Attachments for a specific entity |

- **Automations / engine design:**

```
Upload → store to object storage (S3/R2)
       → INSERT documents (ocrStatus='pending') → SELECT
       → Enqueue BullMQ "ocr-scan" job
OcrWorker:
  1. Download file from storage
  2. Call OCR provider (e.g., Google Document AI, AWS Textract, or self-hosted Tesseract)
  3. Extract: date, vendor name, total, line items, currency
  4. UPDATE documents SET ocrData=?, ocrStatus='complete'
  5. Run matching: SELECT bills/expenses WHERE
       ABS(DATEDIFF(?, date)) <= 3 AND vendor_name LIKE ? AND ABS(amount - ?) < 0.01
  6. Store match suggestions in ocrData.suggestions[]

Email-in: dedicated email address (e.g., docs-<orgId>@intake.astram.io)
  → inbound email webhook (SendGrid / Mailgun Inbound Parse)
  → extract attachments → upload to storage → INSERT with source='email'
```

- **Personalized / better-than-Zoho:**
  - OCR confidence score shown to user; low-confidence fields highlighted for manual correction.
  - Vendor auto-learn: if user manually corrects a vendor name for the same email domain 3 times, cache the mapping.
  - Bank statement parsing: extract all transactions from a PDF bank statement and pre-populate bank transactions list for review.

- **Build status:** New.

---

### 8.12 Client Portal

- **Purpose:** Self-service web portal for customers: view invoices and quotes, make payments, approve quotes, track projects, view statements.

- **Zoho Books behaviour:**
  - Available by default per org; each customer gets a unique portal link + login.
  - Dashboard: outstanding balance, available credits, recent payments, pending quote approvals.
  - Customers can: view/accept/decline quotes (with negotiation comments), pay invoices (full or partial if enabled), view sales orders, access project details and billable hours, approve timesheets, download PDFs, generate statements of account.
  - "Viewed" status: org sees when customer opens a quote or invoice.
  - Customizable portal URL; email template for portal invitation.
  - Selectable payment gateways per invoice shown in portal.
  - Attached documents shown in portal when "Display in Portal" enabled.
  - Custom modules can be exposed in portal.

- **Data model:**

```ts
export const portalAccounts = mysqlTable('portal_accounts', {
  id:           int('id').autoincrement().primaryKey(),
  orgId:        int('org_id').notNull(),
  contactId:    int('contact_id').notNull(),
  email:        text('email').notNull(),
  passwordHash: text('password_hash'),
  portalType:   text('portal_type').notNull().default('client'), // 'client'|'vendor'
  status:       text('status').notNull().default('invited'), // 'invited'|'active'|'suspended'
  token:        text('token'),             // invitation / password-reset token
  tokenExpiry:  timestamp('token_expiry'),
  lastLoginAt:  timestamp('last_login_at'),
  createdAt:    timestamp('created_at').defaultNow(),
});

export const portalSettings = mysqlTable('portal_settings', {
  id:              int('id').autoincrement().primaryKey(),
  orgId:           int('org_id').notNull(),
  subdomain:       text('subdomain'),              // portal URL customization
  showProjects:    int('show_projects').notNull().default(0),
  showTimesheets:  int('show_timesheets').notNull().default(0),
  allowPartialPay: int('allow_partial_pay').notNull().default(0),
  paymentGateways: json('payment_gateways'),       // enabled gateway IDs for portal
  customModules:   json('custom_modules'),         // custom module IDs visible in portal
  updatedAt:       timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const portalViewEvents = mysqlTable('portal_view_events', {
  id:         int('id').autoincrement().primaryKey(),
  orgId:      int('org_id').notNull(),
  portalAccountId: int('portal_account_id').notNull(),
  entityType: text('entity_type').notNull(),
  entityId:   int('entity_id').notNull(),
  viewedAt:   timestamp('viewed_at').defaultNow(),
});
```

- **API (contract-first) — portal-facing (separate auth, `/portal/api` prefix):**

| Method | Path | Description |
|--------|------|-------------|
| `POST`   | `/portal/api/auth/login` | Email + password → session token |
| `POST`   | `/portal/api/auth/logout` | Revoke session |
| `GET`    | `/portal/api/dashboard` | Outstanding, credits, recent activity |
| `GET`    | `/portal/api/invoices` | Contact's invoices |
| `GET`    | `/portal/api/invoices/:id` | Invoice detail + pay link |
| `POST`   | `/portal/api/invoices/:id/pay` | Initiate payment (Stripe) |
| `GET`    | `/portal/api/quotes` | Quotes pending action |
| `POST`   | `/portal/api/quotes/:id/accept` | Accept quote |
| `POST`   | `/portal/api/quotes/:id/decline` | Decline with reason |
| `GET`    | `/portal/api/statements` | Account statement; `?from=DATE&to=DATE` |
| `GET`    | `/portal/api/projects` | Billable projects |
| `GET`    | `/portal/api/timesheets` | Timesheet approvals |
| `POST`   | `/portal/api/timesheets/:id/approve` | Customer approves timesheet |

- **Personalized / better-than-Zoho:**
  - Real-time payment status (WebSocket/SSE): after customer pays, invoice status updates live without page refresh.
  - White-label portal under org's own domain (CNAME support).
  - Chat widget on portal: customer can message the accounting team directly from any transaction.
  - AI-generated statement summary: "You have 3 overdue invoices totalling $2,400. Your next payment is due in 5 days."

- **Build status:** New.

---

### 8.13 Vendor Portal

- **Purpose:** Self-service portal for vendors/suppliers: view POs, upload bills, track payments, collaborate.

- **Zoho Books behaviour:**
  - Dashboard: outstanding bills owed, available credits, last payment received, account details.
  - Vendors can: view PO details, accept or reject POs (with status reflected in Books), upload bill documents (PDF/image, max 5 MB, autoscanned), add comments to transactions.
  - Vendor can edit their own contact details in portal → synced back to Books.
  - Statement of accounts generation.
  - Custom modules accessible in vendor portal.
  - Plan-gated feature.

- **Data model:** Shared with Client Portal — `portal_accounts.portalType = 'vendor'`; separate portal settings for vendor-specific module visibility.

- **API (contract-first) — vendor-facing (`/vendor/api` prefix):**

| Method | Path | Description |
|--------|------|-------------|
| `POST`   | `/vendor/api/auth/login` | Vendor login |
| `GET`    | `/vendor/api/dashboard` | Outstanding bills, credits summary |
| `GET`    | `/vendor/api/purchase-orders` | POs addressed to vendor |
| `POST`   | `/vendor/api/purchase-orders/:id/accept` | Accept PO |
| `POST`   | `/vendor/api/purchase-orders/:id/reject` | Reject with reason |
| `POST`   | `/vendor/api/bills/upload` | Upload bill document → OCR → creates draft bill |
| `GET`    | `/vendor/api/bills` | Vendor's bills in system |
| `GET`    | `/vendor/api/payments` | Payments received history |
| `POST`   | `/vendor/api/comments` | Add comment to a transaction |
| `PUT`    | `/vendor/api/profile` | Update vendor's own contact info |
| `GET`    | `/vendor/api/statements` | Account statement |

- **Personalized / better-than-Zoho:**
  - Vendor submits invoice directly via portal → auto-OCR → appears as draft bill in org for review, linked to PO if matched — eliminates email chase.
  - Vendor can see exactly which bills are queued for payment and expected payment date.
  - Two-way comment thread per transaction (internal team + vendor), with email notifications.

- **Build status:** New.

---

### 8.14 Projects & Timesheets

- **Purpose:** Track billable and non-billable time against projects and tasks; convert approved time to customer invoices.

- **Zoho Books behaviour:**
  - **Billing methods:** Fixed cost (single line item), By task hours, By staff hours, By project hours, Daily rate (full/half day).
  - **Timer:** real-time timer via Ctrl+Cmd+T; can log time manually with start/end or duration.
  - **Tasks:** tasks within projects; each task has hourly rate, cost rate (for internal cost tracking).
  - **Expenses:** project expenses can be billable; appear on invoice.
  - **Billing:** select "Bill up to" date; choose which tasks/staff/entries to include; supports multi-project invoices.
  - **Timesheet approval:** staff submits for internal approval → then optional customer approval in portal.
  - **Integration with Zoho Projects:** fetch approved timesheets from Zoho Projects to Books.
  - **Custom fields:** available on timesheet module.
  - **Customer portal:** customers can view active projects, approve timesheets.

- **Data model:**

```ts
export const projects = mysqlTable('projects', {
  id:            int('id').autoincrement().primaryKey(),
  orgId:         int('org_id').notNull(),
  contactId:     int('contact_id').notNull(),
  name:          text('name').notNull(),
  description:   text('description'),
  billingMethod: text('billing_method').notNull(), // 'fixed'|'task_hours'|'staff_hours'|'project_hours'|'daily_rate'
  fixedAmount:   decimal('fixed_amount', { precision: 15, scale: 2 }),
  budgetType:    text('budget_type'),              // 'hours'|'amount'
  budgetValue:   decimal('budget_value', { precision: 15, scale: 2 }),
  status:        text('status').notNull().default('active'), // 'active'|'completed'|'closed'
  billedThrough: timestamp('billed_through'),
  createdAt:     timestamp('created_at').defaultNow(),
  updatedAt:     timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const projectTasks = mysqlTable('project_tasks', {
  id:          int('id').autoincrement().primaryKey(),
  projectId:   int('project_id').notNull(),
  name:        text('name').notNull(),
  hourlyRate:  decimal('hourly_rate', { precision: 15, scale: 2 }),
  costRate:    decimal('cost_rate', { precision: 15, scale: 2 }),
  budgetHours: decimal('budget_hours', { precision: 10, scale: 2 }),
  status:      text('status').notNull().default('open'), // 'open'|'closed'
  createdAt:   timestamp('created_at').defaultNow(),
});

export const timeEntries = mysqlTable('time_entries', {
  id:          int('id').autoincrement().primaryKey(),
  orgId:       int('org_id').notNull(),
  projectId:   int('project_id').notNull(),
  taskId:      int('task_id'),
  userId:      int('user_id').notNull(),
  logDate:     timestamp('log_date').notNull(),
  hours:       decimal('hours', { precision: 8, scale: 2 }),
  dayType:     text('day_type'),            // null | 'full' | 'half' for daily rate projects
  notes:       text('notes'),
  isBillable:  int('is_billable').notNull().default(1),
  status:      text('status').notNull().default('draft'), // 'draft'|'submitted'|'approved'|'invoiced'
  invoiceId:   int('invoice_id'),          // set when billed
  approvedBy:  int('approved_by'),
  approvedAt:  timestamp('approved_at'),
  createdAt:   timestamp('created_at').defaultNow(),
});

export const projectExpenses = mysqlTable('project_expenses', {
  id:          int('id').autoincrement().primaryKey(),
  projectId:   int('project_id').notNull(),
  expenseId:   int('expense_id').notNull(), // FK to expenses table
  isBillable:  int('is_billable').notNull().default(1),
  markedUpBy:  decimal('marked_up_by', { precision: 6, scale: 4 }).default('0'), // markup %
});
```

- **API (contract-first):**

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/api/projects` | List; `?contactId=X&status=active` |
| `POST`   | `/api/projects` | Create → INSERT then SELECT |
| `GET`    | `/api/projects/:id` | Detail with tasks, budget summary |
| `PUT`    | `/api/projects/:id` | Update |
| `GET`    | `/api/projects/:id/tasks` | List tasks |
| `POST`   | `/api/projects/:id/tasks` | Create task |
| `GET`    | `/api/time-entries` | List; `?projectId=X&userId=Y&status=approved&from=DATE&to=DATE` |
| `POST`   | `/api/time-entries` | Log time → INSERT then SELECT |
| `PUT`    | `/api/time-entries/:id` | Update |
| `DELETE` | `/api/time-entries/:id` | Delete (if not invoiced) |
| `POST`   | `/api/time-entries/:id/start-timer` | Start real-time timer |
| `POST`   | `/api/time-entries/:id/stop-timer` | Stop timer, save hours |
| `POST`   | `/api/time-entries/submit` | Submit batch for approval; body: `{ ids: int[] }` |
| `POST`   | `/api/time-entries/approve` | Approve batch; body: `{ ids: int[] }` |
| `POST`   | `/api/projects/:id/invoice` | Bill project → create invoice from approved unbilled entries |

- **Personalized / better-than-Zoho:**
  - Real-time timer synced across browser tabs (shared via BroadcastChannel / SSE).
  - Budget burn visualization: progress bar on project detail (hours used / total hours budget).
  - AI billing description: auto-generate invoice line item descriptions from time entry notes ("Designed homepage mockup, API integration for contacts module — 8.5 hrs").
  - Automatic budget alert: when project hours reach 80% of budget, notify project owner.

- **Build status:** New.

---

### 8.15 Audit Trail (Ledger Integration)

- **Purpose:** Immutable, hash-chained record of every write operation; compliance backbone for every module.

- **Zoho Books behaviour:**
  - View audit trail per transaction: who modified it, what changed, when.
  - Audit trail now supports Item Preferences; version comparison for settings changes.
  - No cryptographic integrity; no external anchoring; trail is a mutable log.
  - Not exposed via API.

- **Existing implementation (Astram — a key differentiator):**

  Per `docs/SECURITY_LEDGER.md`:
  - **Table:** `audit_log` — `id, ts, actor, action, entityType, entityId, payload, prevHash, hash`.
  - **Chaining:** `hash = SHA256(prevHash + canonical(entry))`; genesis = 64 zeros.
  - **Capture:** Express middleware fires on every successful POST/PUT/PATCH/DELETE; captures response body.
  - **Verify endpoint:** `GET /api/audit/verify` walks the entire chain and detects tampering.
  - **Known limitation:** concurrent writes can race on read-then-write; production should serialize appends.
  - **Recommended next step:** anchor `headHash` to external append-only sink (managed timestamping, public chain, or write-once log).

- **Data model (existing — do not recreate):**

```ts
// Already exists: lib/db/src/schema/audit.ts
// audit_log: id (int autoincrement PK), ts (timestamp), actor (text),
//            action (text), entityType (text), entityId (int),
//            payload (json), prevHash (text), hash (text)
```

- **API extensions (add to existing):**

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/api/audit` | Most-recent entries; `?limit=N&entityType=invoice&entityId=X&actor=Y&from=DATE` |
| `GET`    | `/api/audit/verify` | Chain integrity check; returns `{ valid, total, headHash, brokenAt? }` |
| `GET`    | `/api/audit/:entityType/:entityId` | All ledger entries for a specific record (full history) |
| `GET`    | `/api/audit/export` | Download audit log as CSV for compliance |

- **Workflow / state machine:** The audit ledger has no state machine — it is append-only. The integrity guarantee is: any modification to a historical row causes `verify` to return `valid: false` with `brokenAt` identifying the corrupted entry.

- **Automations / engine design:**

```
Serialization fix (production):
  Replace direct INSERT in appendAudit with a BullMQ "audit-append" queue
  (concurrency: 1 worker) → eliminates the read-then-write race.
  The queue is ordered FIFO; each job: read head hash → compute new hash → INSERT.

External anchoring (recommended):
  Every N entries (e.g., 100) or every 24 h:
    POST { headHash, timestamp, entryCount } to anchoring service
    (OpenTimestamps, own write-once S3 bucket, or Ethereum/Polygon event log)
  Store anchor receipts in audit_anchors table.
```

- **Personalized / better-than-Zoho (this is the biggest differentiator):**
  - Cryptographic integrity: any row-level tampering in the database is detectable — Zoho has no equivalent.
  - Public verify endpoint: auditors and regulators can call `GET /api/audit/verify` and get a signed proof of ledger integrity.
  - Per-entity timeline: every transaction detail page shows its complete audit history inline (who created, who edited what field, who approved, who sent to customer) — all sourced from the hash chain.
  - AI anomaly detection: flag unusual patterns in the audit log (e.g., multiple backdated entries by the same actor in a short window) → raise an alert.
  - Compliance export: download a tamper-evident CSV of all changes in a date range for external audit submission.

- **Build status:** Core ledger implemented and verified working. Extensions (filtering, per-entity API, export, serialization queue, external anchoring) — New.

---

### 8.16 Integrations (Payment Gateways, Bank Feeds, Ecosystem, Import/Export)

- **Purpose:** Connect the portal to external payment processors, bank data providers, the broader Astram product suite, and data migration/export pipelines.

- **Zoho Books behaviour:**

  **Payment gateways:**
  - Stripe: collect one-time and recurring payments; multi-country/currency; bank feed integration fetches Stripe transactions daily; auto-reconciliation.
  - Others: PayPal, Square, Authorize.net, Razorpay, Payflow Pro, 2Checkout, Braintree, WePay — vary by region.
  - Per-invoice gateway selection; customers can save cards; auto-charge for recurring.

  **Bank feeds:**
  - Yodlee (default): auto-fetch every 24 h; MFA banks require manual refresh.
  - Plaid: US/Canada; user authenticates directly.
  - Manual feed via CSV upload or email-in of bank statements.
  - PayPal feed as separate integration.
  - Auto-categorization suggestions when importing transactions.

  **Zoho ecosystem integrations:**
  - Zoho CRM: bidirectional sync contacts, items, invoices, quotes, sales orders, POs; sync every 2 h; instant transaction sync; deal-stage → invoice automation.
  - Zoho Projects: fetch approved timesheets.
  - Zoho Inventory: item and stock sync.
  - Zoho Analytics: push financial data for advanced reporting.
  - Zoho Payroll, Zoho Expense, Zoho Sign.

  **Import/Export:**
  - Import contacts, items, invoices, bills, journals via CSV/XLS with field mapping.
  - Export any module to CSV/XLS; custom export of current filtered view.
  - Migration assistant for moving from QuickBooks, Xero, FreshBooks.

- **Data model:**

```ts
export const integrationConfigs = mysqlTable('integration_configs', {
  id:           int('id').autoincrement().primaryKey(),
  orgId:        int('org_id').notNull(),
  provider:     text('provider').notNull(),  // 'stripe'|'paypal'|'plaid'|'yodlee'|'razorpay'|...
  category:     text('category').notNull(),  // 'payment_gateway'|'bank_feed'|'ecosystem'
  credentials:  json('credentials').notNull(), // encrypted; { apiKey?, secretKey?, accountId? }
  settings:     json('settings'),            // provider-specific settings
  active:       int('active').notNull().default(1),
  lastSyncAt:   timestamp('last_sync_at'),
  syncStatus:   text('sync_status'),         // 'ok'|'error'|'syncing'
  errorMsg:     text('error_msg'),
  createdAt:    timestamp('created_at').defaultNow(),
  updatedAt:    timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const bankFeedAccounts = mysqlTable('bank_feed_accounts', {
  id:              int('id').autoincrement().primaryKey(),
  orgId:           int('org_id').notNull(),
  integrationId:   int('integration_id').notNull(),
  externalAccountId: text('external_account_id').notNull(),
  accountName:     text('account_name').notNull(),
  accountType:     text('account_type'),     // 'checking'|'savings'|'credit'
  currency:        text('currency').notNull(),
  ledgerAccountId: int('ledger_account_id'), // maps to chart of accounts
  lastFetchedAt:   timestamp('last_fetched_at'),
  active:          int('active').notNull().default(1),
  createdAt:       timestamp('created_at').defaultNow(),
});

export const importJobs = mysqlTable('import_jobs', {
  id:           int('id').autoincrement().primaryKey(),
  orgId:        int('org_id').notNull(),
  module:       text('module').notNull(),
  fileName:     text('file_name').notNull(),
  storageKey:   text('storage_key').notNull(),
  status:       text('status').notNull().default('pending'),
  // 'pending'|'processing'|'complete'|'failed'|'partial'
  totalRows:    int('total_rows'),
  importedRows: int('imported_rows'),
  failedRows:   int('failed_rows'),
  errors:       json('errors'),              // [{ row: int; message: string }]
  fieldMapping: json('field_mapping').notNull(),
  createdBy:    int('created_by').notNull(),
  createdAt:    timestamp('created_at').defaultNow(),
  completedAt:  timestamp('completed_at'),
});
```

- **API (contract-first):**

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/api/integrations` | List configured integrations |
| `POST`   | `/api/integrations` | Connect a provider; body: `{ provider, credentials, settings }` |
| `PUT`    | `/api/integrations/:id` | Update credentials / settings |
| `DELETE` | `/api/integrations/:id` | Disconnect |
| `POST`   | `/api/integrations/:id/sync` | Trigger manual sync |
| `GET`    | `/api/integrations/:id/status` | Sync status + last error |
| `GET`    | `/api/bank-feed-accounts` | List linked bank accounts |
| `POST`   | `/api/bank-feed-accounts/:id/fetch` | Manual fetch transactions |
| `POST`   | `/api/import` | Upload CSV → create import job → INSERT then SELECT |
| `GET`    | `/api/import/:id` | Import job status |
| `POST`   | `/api/import/:id/confirm` | Confirm field mapping and start import |
| `GET`    | `/api/export/:module` | Stream CSV of current filtered view |

- **Automations / engine design:**

```
Stripe integration:
  - stripe.webhooks listener at POST /api/integrations/stripe/webhook
  - Verify Stripe-Signature header
  - On payment_intent.succeeded: UPDATE invoice status='paid', record payment
  - On invoice.payment_failed: trigger payment failure workflow rule
  - Stripe bank feed: BullMQ daily job → Stripe API list charges →
    INSERT bank_transactions for reconciliation

Plaid/Yodlee bank feed:
  - Daily BullMQ "bank-feed-sync" job per active bank_feed_account
  - Fetch transactions from provider API
  - INSERT new bank_transactions (deduplicate on externalTxnId)
  - Run auto-categorization: match against existing invoices/bills by amount + date ± 3 days

Import pipeline:
  - Upload CSV → store to S3/R2
  - User previews first 5 rows, maps columns to fields
  - On confirm: BullMQ "import" job → parse CSV row by row → validate via Zod → INSERT
  - Collect errors per row; UPDATE import_jobs with progress
  - On complete: notify user + write audit_log entries for all created records

Astram ecosystem:
  - Internal service-to-service calls use API keys (service account per product)
  - Event-driven: portal emits domain events → Astram HRM / CRM / Payroll subscribe via webhooks
```

- **Personalized / better-than-Zoho:**
  - Astram-native integrations (HRM for payroll sync, Payroll for salary expense journalisation, CRM for deal-to-invoice) replace Zoho's proprietary suite lock-in with open, documented internal APIs.
  - Smart import: AI field-mapping suggestions based on CSV column header names (no manual mapping for common formats).
  - QuickBooks / Xero migration wizard: upload QBO export → AI-maps chart of accounts, contacts, open invoices, trial balance → staged import with rollback.
  - Bank feed AI categorisation: learns from user corrections; after 3 manual overrides for the same merchant/amount pattern, auto-applies the rule.
  - Real-time Stripe reconciliation (via webhooks, not daily polling like Yodlee).

- **Build status:** Stripe integration partially wired (payment intent flow exists); bank feeds, import/export, ecosystem integrations — New.

---

## Shared Engine Summary

| Engine | Technology | Purpose | Status |
|--------|-----------|---------|--------|
| Event bus | Node.js `EventEmitter` → Redis pub/sub (scale) | Domain event fan-out to rule engine, webhooks, audit | Stub exists |
| Rule engine | In-process evaluator; rules cached in Redis | Evaluates workflow rules per event | New |
| Scheduler | BullMQ + Redis repeatable jobs; node-cron (dev) | Recurring profiles, date-based rules, bank feed sync | New |
| Notification service | BullMQ; Nodemailer + SMTP | Email, SMS (Twilio), in-app | Partial |
| Webhook dispatcher | BullMQ; signed HMAC-SHA256 | Outbound event delivery with retries | New |
| OCR worker | BullMQ; Google Document AI / Textract | Document autoscan | New |
| Audit ledger | Append-only MariaDB + SHA-256 chain | Tamper-evident write history | Implemented |
| Import worker | BullMQ; papaparse | CSV → validated rows → bulk INSERT | New |
| Sandbox runner | isolated-vm V8 isolate | Custom function execution | New |

All workers share the same BullMQ Redis connection and are deployed as separate Node.js processes (or a single worker process with named queues in development). The audit ledger middleware fires synchronously before the HTTP response returns, ensuring every successful mutation is captured before the caller receives confirmation.
