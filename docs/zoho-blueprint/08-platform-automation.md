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
