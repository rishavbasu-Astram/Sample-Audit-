import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, taxRatesTable, type TaxRateRow } from "@workspace/db";

const router: IRouter = Router();

function serializeTaxRate(r: TaxRateRow) {
  return {
    ...r,
    rate: parseFloat(String(r.rate)),
    createdAt: r.createdAt.toISOString(),
  };
}

// GET /tax-rates — list all, newest first
router.get("/tax-rates", async (_req, res): Promise<void> => {
  const rows = await db.select().from(taxRatesTable).orderBy(desc(taxRatesTable.createdAt));
  res.json(rows.map(serializeTaxRate));
});

// POST /tax-rates — create
router.post("/tax-rates", async (req, res): Promise<void> => {
  const { name, rate, taxType, isCompound, isActive } = req.body;
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (rate == null) {
    res.status(400).json({ error: "rate is required" });
    return;
  }
  const values: typeof taxRatesTable.$inferInsert = {
    name,
    rate: String(Number(rate)),
    ...(taxType != null ? { taxType: String(taxType) } : {}),
    ...(isCompound != null ? { isCompound: Boolean(isCompound) } : {}),
    ...(isActive != null ? { isActive: Boolean(isActive) } : {}),
  };
  const [inserted] = await db.insert(taxRatesTable).values(values).$returningId();
  const [r] = await db.select().from(taxRatesTable).where(eq(taxRatesTable.id, inserted.id));
  res.status(201).json(serializeTaxRate(r));
});

// GET /tax-rates/:id
router.get("/tax-rates/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(taxRatesTable).where(eq(taxRatesTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeTaxRate(r));
});

// PATCH /tax-rates/:id — partial update
router.patch("/tax-rates/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [existing] = await db.select().from(taxRatesTable).where(eq(taxRatesTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const b = req.body;
  const updates: Partial<typeof taxRatesTable.$inferInsert> = {};
  if (b.name != null) updates.name = String(b.name);
  if (b.rate != null) updates.rate = String(Number(b.rate));
  if (b.taxType != null) updates.taxType = String(b.taxType);
  if (b.isCompound != null) updates.isCompound = Boolean(b.isCompound);
  if (b.isActive != null) updates.isActive = Boolean(b.isActive);

  await db.update(taxRatesTable).set(updates).where(eq(taxRatesTable.id, id));
  const [r] = await db.select().from(taxRatesTable).where(eq(taxRatesTable.id, id));
  res.json(serializeTaxRate(r));
});

// DELETE /tax-rates/:id
router.delete("/tax-rates/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(taxRatesTable).where(eq(taxRatesTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(taxRatesTable).where(eq(taxRatesTable.id, id));
  res.sendStatus(204);
});

export default router;
