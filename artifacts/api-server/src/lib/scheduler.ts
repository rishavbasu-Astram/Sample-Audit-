import { and, eq, lte } from "drizzle-orm";
import {
  db,
  recurringProfilesTable,
  recurringChildrenTable,
  invoicesTable,
  type RecurringProfile,
  type RecurringChild,
  type InvoiceTemplate,
} from "@workspace/db";
import { appendAudit } from "./audit";
import { logger } from "./logger";

// ── Cadence math ──────────────────────────────────────────────────────────────
// Advance a date by one interval of `frequency`. Uses setMonth/setFullYear so
// month/year overflow rolls correctly (e.g. Jan 31 + 1 month → early Mar, native JS).
export function computeNextRun(frequency: string, from: Date, customDays?: number | null): Date {
  const d = new Date(from);
  switch (frequency) {
    case "daily": d.setDate(d.getDate() + 1); break;
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "biweekly": d.setDate(d.getDate() + 14); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "yearly": d.setFullYear(d.getFullYear() + 1); break;
    case "custom": d.setDate(d.getDate() + (customDays && customDays > 0 ? customDays : 30)); break;
    default: d.setMonth(d.getMonth() + 1); break; // sensible fallback
  }
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD, matching the sales schema's text dates
}

export interface GeneratedChild {
  child: RecurringChild;
  invoice: typeof invoicesTable.$inferSelect;
}

// ── Core generation ───────────────────────────────────────────────────────────
// Mint one child entity from a profile's template. This is the single source of
// truth shared by the manual `run-now` endpoint and the interval runner.
//
// `advanceSchedule` distinguishes the two callers:
//   - runner loop   → true:  roll next_run_at forward so the profile does not
//                            re-fire on the next tick (the duplicate-refire guard).
//   - manual run-now → false: an out-of-band extra child; leave the cadence alone.
//
// Only entityType='invoice' + automationMode='draft' are wired in this slice.
export async function generateChildForProfile(
  profile: RecurringProfile,
  opts: { advanceSchedule: boolean },
): Promise<GeneratedChild> {
  const template = profile.templateData as InvoiceTemplate;
  const now = new Date();
  const date = toDateStr(now);
  const due = new Date(now);
  due.setDate(due.getDate() + (template.dueInDays ?? 0));

  const subtotal = Number(template.subtotal ?? 0);
  const taxAmount = Number(template.taxAmount ?? 0);
  const total = Number(template.total ?? subtotal + taxAmount);

  const invoiceNumber = `INV-REC-${Date.now()}-${profile.id}`;
  const [insertedInv] = await db
    .insert(invoicesTable)
    .values({
      invoiceNumber,
      customerId: profile.customerId,
      date,
      dueDate: toDateStr(due),
      status: "draft", // draft mode only in this slice
      subtotal: String(subtotal),
      taxAmount: String(taxAmount),
      total: String(total),
      amountPaid: "0",
      amountDue: String(total),
      notes: template.notes ?? `Auto-generated from recurring profile "${profile.name}"`,
      lineItems: (template.lineItems ?? []) as never,
    })
    .$returningId();
  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, insertedInv.id));

  const [insertedChild] = await db
    .insert(recurringChildrenTable)
    .values({
      profileId: profile.id,
      entityType: "invoice",
      entityId: invoice.id,
      status: "draft",
    })
    .$returningId();
  const [child] = await db
    .select()
    .from(recurringChildrenTable)
    .where(eq(recurringChildrenTable.id, insertedChild.id));

  // Advance the profile. lastRunAt always moves; nextRunAt/status only on the
  // scheduled path so a manual run does not shift the cadence.
  const updates: Partial<typeof recurringProfilesTable.$inferInsert> = { lastRunAt: now };
  if (opts.advanceSchedule) {
    const base = profile.nextRunAt > now ? profile.nextRunAt : now;
    const next = computeNextRun(profile.frequency, base, profile.customDays);
    updates.nextRunAt = next;
    if (profile.endAt && next > profile.endAt) updates.status = "expired";
  }
  await db.update(recurringProfilesTable).set(updates).where(eq(recurringProfilesTable.id, profile.id));

  // The runner mints entities outside the HTTP request lifecycle, so the audit
  // middleware never sees them — record directly to keep the ledger complete.
  await appendAudit({
    actor: "scheduler",
    action: "CREATE",
    entityType: "invoices",
    entityId: String(invoice.id),
    payload: { invoice, recurringProfileId: profile.id, invoiceNumber },
  });

  return { child, invoice };
}

// ── Runner loop ───────────────────────────────────────────────────────────────
export async function runDueProfiles(): Promise<number> {
  const now = new Date();
  const due = await db
    .select()
    .from(recurringProfilesTable)
    .where(and(eq(recurringProfilesTable.status, "active"), lte(recurringProfilesTable.nextRunAt, now)));

  let generated = 0;
  for (const profile of due) {
    try {
      await generateChildForProfile(profile, { advanceSchedule: true });
      generated++;
    } catch (err) {
      // Isolate failures so one bad profile does not halt the batch.
      logger.error({ err, profileId: profile.id }, "recurring profile generation failed");
    }
  }
  if (generated > 0) logger.info({ generated }, "recurring engine generated child invoices");
  return generated;
}

let running = false;

// Lightweight in-process runner. The blueprint's production target is BullMQ +
// Redis; node-cron/setInterval is the documented dev path and needs no new
// dependency. `run-now` remains the synchronous, deterministic verification path.
export function startScheduler(intervalMs = 60_000): NodeJS.Timeout {
  const tick = async () => {
    if (running) return; // never overlap ticks
    running = true;
    try {
      await runDueProfiles();
    } catch (err) {
      logger.error({ err }, "recurring engine tick failed");
    } finally {
      running = false;
    }
  };
  void tick(); // catch anything already due at boot
  const handle = setInterval(() => void tick(), intervalMs);
  logger.info({ intervalMs }, "recurring engine started");
  return handle;
}
