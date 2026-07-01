import { and, eq, inArray, notInArray, gt, sql } from "drizzle-orm";
import {
  db,
  reminderRulesTable,
  reminderLogTable,
  invoicesTable,
  customersTable,
  type ReminderRule,
} from "@workspace/db";
import { appendAudit } from "./audit";
import { logger } from "./logger";

// ── Date helpers (invoice dates are 'YYYY-MM-DD' text) ────────────────────────
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function parseDateStr(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}
function addDaysStr(s: string, n: number): string {
  const d = parseDateStr(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateStr(d);
}
function daysBetween(fromStr: string, toStr: string): number {
  return Math.round((parseDateStr(toStr).getTime() - parseDateStr(fromStr).getTime()) / 86_400_000);
}

// ── Template rendering ────────────────────────────────────────────────────────
export interface DueReminder {
  invoiceId: number;
  invoiceNumber: string;
  ruleId: number;
  ruleName: string;
  customerId: number;
  customerName: string | null;
  occurrenceDate: string;
  dueDate: string;
  amountDue: number;
  daysOverdue: number;
  channel: string;
  subject: string;
  message: string;
}

function render(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => (k in vars ? String(vars[k]) : `{{${k}}}`));
}

// Compute the occurrence dates a rule would fire for one invoice, up to `today`.
// base = dueDate + offsetDays; if repeatEveryDays is set, step forward (overdue
// nudges) bounded by `today` and `maxReminders`.
function occurrenceDates(rule: ReminderRule, dueDate: string, today: string): string[] {
  const base = addDaysStr(dueDate, rule.offsetDays);
  const dates: string[] = [];
  if (rule.repeatEveryDays && rule.repeatEveryDays > 0) {
    let cur = base;
    const cap = rule.maxReminders && rule.maxReminders > 0 ? rule.maxReminders : 60; // hard safety cap
    while (daysBetween(cur, today) >= 0 && dates.length < cap) {
      dates.push(cur);
      cur = addDaysStr(cur, rule.repeatEveryDays);
    }
  } else if (daysBetween(base, today) >= 0) {
    dates.push(base);
  }
  return dates;
}

// Delivery seam. Stubbed: record intent to the log + app logger. Swap this for a
// real email/SMS provider later — the rendered subject/body/channel are ready.
function deliverReminder(r: DueReminder): "sent" | "failed" {
  logger.info(
    { channel: r.channel, invoice: r.invoiceNumber, customer: r.customerName, occurrenceDate: r.occurrenceDate },
    "payment reminder dispatched (stub delivery)",
  );
  return "sent";
}

// ── Core scan ─────────────────────────────────────────────────────────────────
// Returns the reminders due to fire now. When !dryRun, each is persisted to the
// reminder_log, delivered (stub), and recorded in the audit ledger.
export async function runDueReminders(opts: { dryRun?: boolean } = {}): Promise<{
  generated: number;
  due: DueReminder[];
}> {
  const today = toDateStr(new Date());

  const rules = await db.select().from(reminderRulesTable).where(eq(reminderRulesTable.active, true));
  if (rules.length === 0) return { generated: 0, due: [] };

  // Dunning targets: invoices that have been sent and are still owing. Drafts
  // (not yet sent) and paid/cancelled invoices are excluded.
  const openInvoices = await db
    .select()
    .from(invoicesTable)
    .where(and(notInArray(invoicesTable.status, ["draft", "paid", "cancelled"]), gt(sql`amount_due`, 0)));
  if (openInvoices.length === 0) return { generated: 0, due: [] };

  const custIds = [...new Set(openInvoices.map((i) => i.customerId))];
  const customers = custIds.length
    ? await db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable).where(inArray(customersTable.id, custIds))
    : [];
  const nameById = new Map(customers.map((c) => [c.id, c.name]));

  // Existing log rows for these invoices → dedup key set "invoiceId|ruleId|occurrenceDate".
  const invIds = openInvoices.map((i) => i.id);
  const existing = invIds.length
    ? await db
        .select({ invoiceId: reminderLogTable.invoiceId, ruleId: reminderLogTable.ruleId, occurrenceDate: reminderLogTable.occurrenceDate })
        .from(reminderLogTable)
        .where(inArray(reminderLogTable.invoiceId, invIds))
    : [];
  const fired = new Set(existing.map((e) => `${e.invoiceId}|${e.ruleId}|${e.occurrenceDate}`));

  const due: DueReminder[] = [];
  for (const inv of openInvoices) {
    const amountDue = parseFloat(String(inv.amountDue));
    const customerName = nameById.get(inv.customerId) ?? null;
    for (const rule of rules) {
      for (const occ of occurrenceDates(rule, inv.dueDate, today)) {
        if (fired.has(`${inv.id}|${rule.id}|${occ}`)) continue;
        const daysOverdue = daysBetween(inv.dueDate, today);
        const vars = {
          customerName: customerName ?? "there",
          invoiceNumber: inv.invoiceNumber,
          amountDue: amountDue.toFixed(2),
          dueDate: inv.dueDate,
          daysOverdue: Math.max(daysOverdue, 0),
          daysUntilDue: Math.max(-daysOverdue, 0),
        };
        due.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          ruleId: rule.id,
          ruleName: rule.name,
          customerId: inv.customerId,
          customerName,
          occurrenceDate: occ,
          dueDate: inv.dueDate,
          amountDue,
          daysOverdue,
          channel: rule.channel,
          subject: render(rule.subject, vars),
          message: render(rule.bodyTemplate, vars),
        });
      }
    }
  }

  if (opts.dryRun) return { generated: 0, due };

  let generated = 0;
  for (const r of due) {
    try {
      const status = deliverReminder(r);
      await db.insert(reminderLogTable).values({
        invoiceId: r.invoiceId,
        ruleId: r.ruleId,
        customerId: r.customerId,
        occurrenceDate: r.occurrenceDate,
        dueDate: r.dueDate,
        amountDue: String(r.amountDue),
        channel: r.channel,
        subject: r.subject,
        message: r.message,
        status,
      });
      // Outside the HTTP lifecycle when run by the interval, so record directly.
      await appendAudit({
        actor: "scheduler",
        action: "CREATE",
        entityType: "reminder_log",
        entityId: String(r.invoiceId),
        payload: { invoiceNumber: r.invoiceNumber, ruleId: r.ruleId, occurrenceDate: r.occurrenceDate, channel: r.channel, status },
      });
      generated++;
    } catch (err) {
      logger.error({ err, invoiceId: r.invoiceId, ruleId: r.ruleId }, "reminder dispatch failed");
    }
  }
  if (generated > 0) logger.info({ generated }, "payment reminders dispatched");
  return { generated, due };
}

// ── Runner loop ─────────────────────────────────────────────────────────────
let running = false;
export function startReminderScheduler(intervalMs = 60_000): NodeJS.Timeout {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runDueReminders();
    } catch (err) {
      logger.error({ err }, "reminder engine tick failed");
    } finally {
      running = false;
    }
  };
  void tick();
  const handle = setInterval(() => void tick(), intervalMs);
  logger.info({ intervalMs }, "payment reminder engine started");
  return handle;
}
