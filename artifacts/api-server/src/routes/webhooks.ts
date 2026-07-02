import { Router, type IRouter } from "express";
import { eq, desc, sql, inArray } from "drizzle-orm";
import {
  db,
  webhooksTable,
  webhookDeliveriesTable,
  type WebhookRow,
  type WebhookDeliveryRow,
} from "@workspace/db";
import { deliverTo } from "../lib/webhooks";

const router: IRouter = Router();

// ── Serializers ───────────────────────────────────────────────────────────────

async function deliveryCounts(): Promise<Map<number, number>> {
  const rows = await db
    .select({
      webhookId: webhookDeliveriesTable.webhookId,
      count: sql<number>`COUNT(*)`.as("count"),
    })
    .from(webhookDeliveriesTable)
    .groupBy(webhookDeliveriesTable.webhookId);
  return new Map(rows.map((r) => [r.webhookId, Number(r.count)]));
}

function serializeWebhook(hook: WebhookRow, deliveryCount: number) {
  return {
    id: hook.id,
    name: hook.name,
    url: hook.url,
    events: hook.events,
    hasSecret: !!hook.secret,
    active: hook.active,
    deliveryCount,
    createdAt: hook.createdAt.toISOString(),
  };
}

function serializeDelivery(d: WebhookDeliveryRow, webhookName?: string | null) {
  return {
    id: d.id,
    webhookId: d.webhookId,
    webhookName: webhookName ?? null,
    event: d.event,
    status: d.status,
    responseCode: d.responseCode ?? null,
    error: d.error ?? null,
    durationMs: d.durationMs ?? null,
    createdAt: d.createdAt.toISOString(),
  };
}

// ── Webhooks CRUD ─────────────────────────────────────────────────────────────

router.get("/webhooks", async (_req, res): Promise<void> => {
  const hooks = await db.select().from(webhooksTable).orderBy(desc(webhooksTable.createdAt));
  const counts = await deliveryCounts();
  res.json(hooks.map((h) => serializeWebhook(h, counts.get(h.id) ?? 0)));
});

router.post("/webhooks", async (req, res): Promise<void> => {
  const { name, url, events, secret, active } = req.body;

  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" });
    return;
  }
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    res.status(400).json({ error: "url must start with http:// or https://" });
    return;
  }

  let resolvedEvents: string[] = ["*"];
  if (events != null) {
    if (!Array.isArray(events) || events.length === 0 || !events.every((e: unknown) => typeof e === "string")) {
      res.status(400).json({ error: "events must be a non-empty array of strings" });
      return;
    }
    resolvedEvents = events as string[];
  }

  const values: typeof webhooksTable.$inferInsert = {
    name,
    url,
    events: resolvedEvents,
    ...(secret != null ? { secret: String(secret) } : {}),
    ...(active != null ? { active: Boolean(active) } : {}),
  };

  const [inserted] = await db.insert(webhooksTable).values(values).$returningId();
  const [hook] = await db.select().from(webhooksTable).where(eq(webhooksTable.id, inserted.id));
  res.status(201).json(serializeWebhook(hook, 0));
});

router.get("/webhooks/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [hook] = await db.select().from(webhooksTable).where(eq(webhooksTable.id, id));
  if (!hook) { res.status(404).json({ error: "Not found" }); return; }
  const counts = await deliveryCounts();
  res.json(serializeWebhook(hook, counts.get(id) ?? 0));
});

router.patch("/webhooks/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [existing] = await db.select().from(webhooksTable).where(eq(webhooksTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const b = req.body;
  const updates: Partial<typeof webhooksTable.$inferInsert> = {};

  if (b.name != null) updates.name = String(b.name);
  if (b.url != null) updates.url = String(b.url);
  if ("events" in b && Array.isArray(b.events) && b.events.length > 0) {
    updates.events = b.events as string[];
  }
  // Allow clearing secret with explicit null; otherwise set if provided
  if ("secret" in b) updates.secret = b.secret != null ? String(b.secret) : null;
  if (b.active != null) updates.active = Boolean(b.active);

  if (Object.keys(updates).length > 0) {
    await db.update(webhooksTable).set(updates).where(eq(webhooksTable.id, id));
  }

  const [hook] = await db.select().from(webhooksTable).where(eq(webhooksTable.id, id));
  const counts = await deliveryCounts();
  res.json(serializeWebhook(hook, counts.get(id) ?? 0));
});

router.delete("/webhooks/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [hook] = await db.select().from(webhooksTable).where(eq(webhooksTable.id, id));
  if (!hook) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(webhookDeliveriesTable).where(eq(webhookDeliveriesTable.webhookId, id));
  await db.delete(webhooksTable).where(eq(webhooksTable.id, id));
  res.sendStatus(204);
});

// ── Test endpoint ─────────────────────────────────────────────────────────────

router.post("/webhooks/:id/test", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [hook] = await db.select().from(webhooksTable).where(eq(webhooksTable.id, id));
  if (!hook) { res.status(404).json({ error: "Not found" }); return; }

  const deliveryId = await deliverTo(hook, "test.PING", { message: "Astram webhook test", webhookId: id });

  const [delivery] = await db.select().from(webhookDeliveriesTable).where(eq(webhookDeliveriesTable.id, deliveryId));
  res.json(serializeDelivery(delivery, hook.name));
});

// ── Deliveries list ───────────────────────────────────────────────────────────

router.get("/webhook-deliveries", async (req, res): Promise<void> => {
  const webhookIdRaw = req.query.webhookId;
  const webhookIdFilter = webhookIdRaw != null ? parseInt(String(webhookIdRaw), 10) : null;

  let query = db
    .select()
    .from(webhookDeliveriesTable)
    .orderBy(desc(webhookDeliveriesTable.id))
    .limit(100);

  const rows: WebhookDeliveryRow[] = webhookIdFilter != null && Number.isFinite(webhookIdFilter)
    ? await db
        .select()
        .from(webhookDeliveriesTable)
        .where(eq(webhookDeliveriesTable.webhookId, webhookIdFilter))
        .orderBy(desc(webhookDeliveriesTable.id))
        .limit(100)
    : await query;

  // Enrich with webhook name
  const hookIds = [...new Set(rows.map((r) => r.webhookId))];
  const hooks = hookIds.length
    ? await db.select({ id: webhooksTable.id, name: webhooksTable.name }).from(webhooksTable).where(inArray(webhooksTable.id, hookIds))
    : [];
  const hookName = new Map(hooks.map((h) => [h.id, h.name]));

  res.json(rows.map((d) => serializeDelivery(d, hookName.get(d.webhookId) ?? null)));
});

export default router;
