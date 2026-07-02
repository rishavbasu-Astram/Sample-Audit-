import { Router, type IRouter } from "express";
import { eq, sql, desc, inArray } from "drizzle-orm";
import {
  db,
  recurringProfilesTable,
  recurringChildrenTable,
  invoicesTable,
  customersTable,
  type RecurringProfile,
  type RecurringChild,
  type InvoiceTemplate,
} from "@workspace/db";
import { generateChildForProfile, computeNextRun } from "../lib/scheduler";

const router: IRouter = Router();

// ── Serialization ─────────────────────────────────────────────────────────────
function serializeProfile(p: RecurringProfile, customerName: string | null, childCount: number) {
  return {
    ...p,
    customerName,
    templateData: p.templateData,
    customDays: p.customDays ?? null,
    // Nullable timestamps must be guarded — .toISOString() on null throws.
    nextRunAt: p.nextRunAt.toISOString(),
    lastRunAt: p.lastRunAt ? p.lastRunAt.toISOString() : null,
    endAt: p.endAt ? p.endAt.toISOString() : null,
    childCount,
    createdAt: p.createdAt.toISOString(),
  };
}

type InvoiceRow = typeof invoicesTable.$inferSelect;
function serializeChild(child: RecurringChild, invoice: InvoiceRow | undefined) {
  return {
    id: child.id,
    profileId: child.profileId,
    entityType: child.entityType,
    entityId: child.entityId,
    entityNumber: invoice?.invoiceNumber ?? null,
    amount: invoice ? parseFloat(String(invoice.total)) : 0,
    generatedAt: child.generatedAt.toISOString(),
    status: child.status,
  };
}

async function countChildrenByProfile(profileIds: number[]): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (profileIds.length === 0) return counts;
  const rows = await db
    .select({ profileId: recurringChildrenTable.profileId, n: sql<number>`count(*)` })
    .from(recurringChildrenTable)
    .where(inArray(recurringChildrenTable.profileId, profileIds))
    .groupBy(recurringChildrenTable.profileId);
  for (const r of rows) counts.set(r.profileId, Number(r.n));
  return counts;
}

// ── Recurring profiles ─────────────────────────────────────────────────────────
router.get("/recurring-profiles", async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  let profiles = await db.select().from(recurringProfilesTable).orderBy(desc(recurringProfilesTable.createdAt));
  if (status) profiles = profiles.filter((p) => p.status === status);

  const customers = await db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable);
  const nameById = new Map(customers.map((c) => [c.id, c.name]));
  const counts = await countChildrenByProfile(profiles.map((p) => p.id));

  res.json(profiles.map((p) => serializeProfile(p, nameById.get(p.customerId) ?? null, counts.get(p.id) ?? 0)));
});

router.post("/recurring-profiles", async (req, res): Promise<void> => {
  const { name, customerId, frequency, customDays, automationMode, subtotal, taxAmount, dueInDays, notes, startDate } =
    req.body;
  if (!name || !customerId || !frequency || subtotal === undefined || subtotal === null) {
    res.status(400).json({ error: "name, customerId, frequency and subtotal are required" });
    return;
  }

  const sub = Number(subtotal);
  const tax = Number(taxAmount ?? 0);
  const template: InvoiceTemplate = {
    subtotal: sub,
    taxAmount: tax,
    total: sub + tax,
    dueInDays: Number(dueInDays ?? 0),
    notes: notes || undefined,
    lineItems: [],
  };

  // nextRunAt is NOT NULL with no DB default — compute the first run here.
  // First run happens on the start date (Zoho behaviour), defaulting to now.
  const nextRunAt = startDate ? new Date(startDate) : new Date();

  const [inserted] = await db
    .insert(recurringProfilesTable)
    .values({
      entityType: "invoice",
      name,
      customerId: Number(customerId),
      templateData: template,
      frequency,
      customDays: customDays != null ? Number(customDays) : null,
      automationMode: automationMode || "draft",
      nextRunAt,
    })
    .$returningId();

  const [p] = await db.select().from(recurringProfilesTable).where(eq(recurringProfilesTable.id, inserted.id));
  const [customer] = await db
    .select({ name: customersTable.name })
    .from(customersTable)
    .where(eq(customersTable.id, p.customerId));
  res.status(201).json(serializeProfile(p, customer?.name ?? null, 0));
});

router.get("/recurring-profiles/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [p] = await db.select().from(recurringProfilesTable).where(eq(recurringProfilesTable.id, id));
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  const [customer] = await db
    .select({ name: customersTable.name })
    .from(customersTable)
    .where(eq(customersTable.id, p.customerId));
  const counts = await countChildrenByProfile([id]);
  res.json(serializeProfile(p, customer?.name ?? null, counts.get(id) ?? 0));
});

router.delete("/recurring-profiles/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [p] = await db.select().from(recurringProfilesTable).where(eq(recurringProfilesTable.id, id));
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(recurringProfilesTable).where(eq(recurringProfilesTable.id, id));
  res.sendStatus(204);
});

// Toggle active <-> paused. An expired profile cannot be resumed (its schedule ran out).
router.patch("/recurring-profiles/:id/pause", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [p] = await db.select().from(recurringProfilesTable).where(eq(recurringProfilesTable.id, id));
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  if (p.status === "expired") { res.status(409).json({ error: "Expired profiles cannot be resumed" }); return; }

  const nextStatus = p.status === "active" ? "paused" : "active";
  // Resuming a profile whose next_run_at is in the past would fire immediately;
  // roll it forward from now so resume means "start the next cycle from here".
  const updates: Partial<typeof recurringProfilesTable.$inferInsert> = { status: nextStatus };
  const now = new Date();
  if (nextStatus === "active" && p.nextRunAt <= now) {
    updates.nextRunAt = computeNextRun(p.frequency, now, p.customDays);
  }
  await db.update(recurringProfilesTable).set(updates).where(eq(recurringProfilesTable.id, id));

  const [updated] = await db.select().from(recurringProfilesTable).where(eq(recurringProfilesTable.id, id));
  const [customer] = await db
    .select({ name: customersTable.name })
    .from(customersTable)
    .where(eq(customersTable.id, updated.customerId));
  const counts = await countChildrenByProfile([id]);
  res.json(serializeProfile(updated, customer?.name ?? null, counts.get(id) ?? 0));
});

// Manual, synchronous generation — the deterministic verification path.
router.post("/recurring-profiles/:id/run-now", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [p] = await db.select().from(recurringProfilesTable).where(eq(recurringProfilesTable.id, id));
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  const { child, invoice } = await generateChildForProfile(p, { advanceSchedule: false });
  res.status(201).json(serializeChild(child, invoice));
});

router.get("/recurring-profiles/:id/children", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const children = await db
    .select()
    .from(recurringChildrenTable)
    .where(eq(recurringChildrenTable.profileId, id))
    .orderBy(desc(recurringChildrenTable.generatedAt));

  const invoiceIds = children.map((c) => c.entityId);
  const invoices =
    invoiceIds.length > 0
      ? await db.select().from(invoicesTable).where(inArray(invoicesTable.id, invoiceIds))
      : [];
  const invById = new Map(invoices.map((i) => [i.id, i]));
  res.json(children.map((c) => serializeChild(c, invById.get(c.entityId))));
});

export default router;
