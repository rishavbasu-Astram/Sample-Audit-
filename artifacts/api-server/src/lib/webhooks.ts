import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, webhooksTable, webhookDeliveriesTable, type WebhookRow } from "@workspace/db";
import { logger } from "./logger";

// ── Pattern matching ──────────────────────────────────────────────────────────

function matchesEvent(patterns: string[], event: string): boolean {
  for (const pattern of patterns) {
    if (pattern === "*") return true;
    if (pattern === event) return true;
    if (pattern.endsWith(".*") && event.startsWith(pattern.slice(0, -1))) return true;
  }
  return false;
}

// ── Delivery ──────────────────────────────────────────────────────────────────

export async function deliverTo(hook: WebhookRow, event: string, payload: unknown): Promise<number> {
  try {
    const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload ?? null });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Astram-Event": event,
    };

    if (hook.secret) {
      const sig = crypto.createHmac("sha256", hook.secret).update(body).digest("hex");
      headers["X-Astram-Signature"] = `sha256=${sig}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    let status: string;
    let responseCode: number | undefined;
    let error: string | undefined;
    let durationMs: number;

    const start = Date.now();
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      durationMs = Date.now() - start;
      status = res.ok ? "delivered" : "failed";
      responseCode = res.status;
    } catch (err) {
      durationMs = Date.now() - start;
      status = "failed";
      error = String(err).slice(0, 500);
    } finally {
      clearTimeout(timeout);
    }

    const [inserted] = await db.insert(webhookDeliveriesTable).values({
      webhookId: hook.id,
      event,
      payload,
      status,
      ...(responseCode != null ? { responseCode } : {}),
      ...(error != null ? { error } : {}),
      durationMs,
    }).$returningId();

    return inserted.id;
  } catch (err) {
    logger.error({ err, webhookId: hook.id, event }, "webhook delivery insert failed");
    return -1;
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function dispatchWebhookEvent(event: string, payload: unknown): Promise<void> {
  // Guard: delivery-log inserts must NOT recursively dispatch to prevent a feedback loop.
  if (event.startsWith("webhook_delivery.")) return;

  try {
    const hooks = await db
      .select()
      .from(webhooksTable)
      .where(eq(webhooksTable.active, true));

    for (const hook of hooks) {
      if (matchesEvent(hook.events, event)) {
        await deliverTo(hook, event, payload);
      }
    }
  } catch (err) {
    logger.error({ err, event }, "dispatchWebhookEvent failed");
  }
}
