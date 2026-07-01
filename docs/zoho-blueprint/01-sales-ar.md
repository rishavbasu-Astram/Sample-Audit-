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
