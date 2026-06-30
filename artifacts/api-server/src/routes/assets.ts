import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, assetsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/assets", async (req, res): Promise<void> => {
  const { status, type } = req.query;
  let query = db.select().from(assetsTable).$dynamic();
  if (status) query = query.where(eq(assetsTable.status, String(status)));
  const assets = await query.orderBy(sql`created_at desc`);
  res.json(
    assets.map((a) => ({
      ...a,
      purchasePrice: parseFloat(String(a.purchasePrice)),
      currentValue: parseFloat(String(a.currentValue)),
      createdAt: a.createdAt.toISOString(),
    }))
  );
});

router.post("/assets", async (req, res): Promise<void> => {
  const { name, assetType, purchaseDate, purchasePrice, currentValue, depreciationMethod, status, notes } = req.body;
  if (!name || !assetType || !purchaseDate || purchasePrice == null || currentValue == null) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const [asset] = await db
    .insert(assetsTable)
    .values({ name, assetType, purchaseDate, purchasePrice: String(purchasePrice), currentValue: String(currentValue), depreciationMethod, status: status ?? "active", notes })
    .returning();
  res.status(201).json({ ...asset, purchasePrice: parseFloat(String(asset.purchasePrice)), currentValue: parseFloat(String(asset.currentValue)), createdAt: asset.createdAt.toISOString() });
});

router.get("/assets/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [asset] = await db.select().from(assetsTable).where(eq(assetsTable.id, id));
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  res.json({ ...asset, purchasePrice: parseFloat(String(asset.purchasePrice)), currentValue: parseFloat(String(asset.currentValue)), createdAt: asset.createdAt.toISOString() });
});

router.patch("/assets/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, currentValue, status, notes } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (currentValue !== undefined) updates.currentValue = String(currentValue);
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  const [asset] = await db.update(assetsTable).set(updates).where(eq(assetsTable.id, id)).returning();
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  res.json({ ...asset, purchasePrice: parseFloat(String(asset.purchasePrice)), currentValue: parseFloat(String(asset.currentValue)), createdAt: asset.createdAt.toISOString() });
});

router.delete("/assets/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [asset] = await db.delete(assetsTable).where(eq(assetsTable.id, id)).returning();
  if (!asset) { res.status(404).json({ error: "Asset not found" }); return; }
  res.sendStatus(204);
});

export default router;
