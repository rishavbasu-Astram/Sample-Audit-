# 06 — Taxes & Compliance

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
