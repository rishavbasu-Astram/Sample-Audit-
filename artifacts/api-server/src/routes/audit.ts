import { Router, type IRouter } from "express";
import { db, auditLogTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { verifyChain } from "../lib/audit";

const router: IRouter = Router();

/** Verify the integrity of the whole chain (define before /audit list route). */
router.get("/audit/verify", async (_req, res): Promise<void> => {
  const result = await verifyChain();
  res.json(result);
});

/** Most-recent audit entries (newest first). */
router.get("/audit", async (req, res): Promise<void> => {
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
  const rows = await db
    .select()
    .from(auditLogTable)
    .orderBy(desc(auditLogTable.id))
    .limit(limit);
  res.json(rows);
});

export default router;
