# 5. Items, Inventory & Price Lists

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
