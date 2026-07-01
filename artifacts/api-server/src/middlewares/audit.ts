import type { Request, Response, NextFunction } from "express";
import { appendAudit } from "../lib/audit";
import { logger } from "../lib/logger";

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Records every successful mutating request into the hash-chained audit ledger.
 * Captures the JSON response body (so the created/updated entity, including its id,
 * is part of the immutable record) and appends after the response finishes.
 */
export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATIONS.has(req.method)) {
    next();
    return;
  }

  const originalJson = res.json.bind(res);
  let captured: unknown;
  res.json = (body: unknown) => {
    captured = body;
    return originalJson(body);
  };

  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;

    const action =
      req.method === "POST" ? "CREATE" : req.method === "DELETE" ? "DELETE" : "UPDATE";
    const segments = req.path.split("/").filter(Boolean);
    const entityType = segments[0] ?? "unknown";

    const bodyId =
      captured && typeof captured === "object" && "id" in captured
        ? (captured as { id: unknown }).id
        : undefined;
    const lastSeg = segments[segments.length - 1];
    const pathId = lastSeg && /^\d+$/.test(lastSeg) ? lastSeg : undefined;
    const entityId = bodyId ?? pathId ?? null;

    void appendAudit({
      action,
      entityType,
      entityId: entityId != null ? String(entityId) : null,
      payload: captured ?? null,
    }).catch((err) => logger.error({ err }, "audit ledger append failed"));
  });

  next();
}
