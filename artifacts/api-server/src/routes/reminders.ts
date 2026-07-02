import { Router, type IRouter } from "express";
import { eq, desc, inArray } from "drizzle-orm";
import {
  db,
  reminderRulesTable,
  reminderLogTable,
  invoicesTable,
  customersTable,
  type ReminderRule,
  type ReminderLog,
} from "@workspace/db";
import { runDueReminders } from "../lib/reminders";
import { emailProviderConfigured } from "../lib/email";

const router: IRouter = Router();

function serializeRule(r: ReminderRule) {
  return { ...r, createdAt: r.createdAt.toISOString() };
}

// ── Reminders engine actions (define before param routes) ─────────────────────

// Manual, synchronous dispatch — the deterministic verification path.
router.post("/reminders/run-now", async (_req, res): Promise<void> => {
  const { generated } = await runDueReminders({ dryRun: false });
  // 'live' = a real email provider is configured (sends happen); 'simulated' =
  // no provider, deliveries are logged only.
  res.status(201).json({ generated, delivery: emailProviderConfigured() ? "live" : "simulated" });
});

// Dry-run: what would fire right now, without sending or logging anything.
router.get("/reminders/preview", async (_req, res): Promise<void> => {
  const { due } = await runDueReminders({ dryRun: true });
  res.json(due);
});

// Recent dispatched reminders, enriched with invoice number + customer name.
router.get("/reminders/log", async (req, res): Promise<void> => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
  const rows: ReminderLog[] = await db
    .select()
    .from(reminderLogTable)
    .orderBy(desc(reminderLogTable.id))
    .limit(limit);

  const invIds = [...new Set(rows.map((r) => r.invoiceId))];
  const custIds = [...new Set(rows.map((r) => r.customerId))];
  const invoices = invIds.length
    ? await db.select({ id: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber }).from(invoicesTable).where(inArray(invoicesTable.id, invIds))
    : [];
  const customers = custIds.length
    ? await db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable).where(inArray(customersTable.id, custIds))
    : [];
  const invNum = new Map(invoices.map((i) => [i.id, i.invoiceNumber]));
  const custName = new Map(customers.map((c) => [c.id, c.name]));

  res.json(
    rows.map((r) => ({
      id: r.id,
      invoiceId: r.invoiceId,
      invoiceNumber: invNum.get(r.invoiceId) ?? null,
      ruleId: r.ruleId,
      customerId: r.customerId,
      customerName: custName.get(r.customerId) ?? null,
      occurrenceDate: r.occurrenceDate,
      dueDate: r.dueDate,
      amountDue: parseFloat(String(r.amountDue)),
      channel: r.channel,
      recipient: r.recipient ?? null,
      subject: r.subject,
      message: r.message,
      status: r.status,
      sentAt: r.sentAt.toISOString(),
    })),
  );
});

// ── Reminder rules CRUD ───────────────────────────────────────────────────────
router.get("/reminder-rules", async (req, res): Promise<void> => {
  let rules = await db.select().from(reminderRulesTable).orderBy(desc(reminderRulesTable.createdAt));
  if (req.query.active === "true") rules = rules.filter((r) => r.active);
  res.json(rules.map(serializeRule));
});

router.post("/reminder-rules", async (req, res): Promise<void> => {
  const { name, offsetDays, repeatEveryDays, maxReminders, channel, subject, bodyTemplate, active } = req.body;
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const values: typeof reminderRulesTable.$inferInsert = {
    name,
    offsetDays: offsetDays != null ? Number(offsetDays) : 0,
    repeatEveryDays: repeatEveryDays != null ? Number(repeatEveryDays) : null,
    maxReminders: maxReminders != null ? Number(maxReminders) : null,
    ...(channel ? { channel } : {}),
    ...(subject ? { subject } : {}),
    ...(bodyTemplate ? { bodyTemplate } : {}),
    ...(active != null ? { active: Boolean(active) } : {}),
  };
  const [inserted] = await db.insert(reminderRulesTable).values(values).$returningId();
  const [r] = await db.select().from(reminderRulesTable).where(eq(reminderRulesTable.id, inserted.id));
  res.status(201).json(serializeRule(r));
});

router.get("/reminder-rules/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(reminderRulesTable).where(eq(reminderRulesTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeRule(r));
});

router.patch("/reminder-rules/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [existing] = await db.select().from(reminderRulesTable).where(eq(reminderRulesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const b = req.body;
  const updates: Partial<typeof reminderRulesTable.$inferInsert> = {};
  if (b.name != null) updates.name = String(b.name);
  if (b.offsetDays != null) updates.offsetDays = Number(b.offsetDays);
  if ("repeatEveryDays" in b) updates.repeatEveryDays = b.repeatEveryDays != null ? Number(b.repeatEveryDays) : null;
  if ("maxReminders" in b) updates.maxReminders = b.maxReminders != null ? Number(b.maxReminders) : null;
  if (b.channel != null) updates.channel = String(b.channel);
  if (b.subject != null) updates.subject = String(b.subject);
  if (b.bodyTemplate != null) updates.bodyTemplate = String(b.bodyTemplate);
  if (b.active != null) updates.active = Boolean(b.active);

  await db.update(reminderRulesTable).set(updates).where(eq(reminderRulesTable.id, id));
  const [r] = await db.select().from(reminderRulesTable).where(eq(reminderRulesTable.id, id));
  res.json(serializeRule(r));
});

router.delete("/reminder-rules/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(reminderRulesTable).where(eq(reminderRulesTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(reminderRulesTable).where(eq(reminderRulesTable.id, id));
  res.sendStatus(204);
});

export default router;
