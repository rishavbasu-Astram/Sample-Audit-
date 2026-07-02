import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, itemsTable, taxRatesTable, type ItemRow } from "@workspace/db";

const router: IRouter = Router();

// Tax rate lookup shape — taxRatesTable has id/name/rate columns.
type TaxRateRow = { id: number; name: string; rate: string };

function serializeItem(row: ItemRow, taxById: Map<number, TaxRateRow>) {
  const tax = row.taxRateId != null ? taxById.get(row.taxRateId) ?? null : null;
  const reorderLevel = row.reorderLevel != null ? parseFloat(String(row.reorderLevel)) : null;
  const stockOnHand = parseFloat(String(row.stockOnHand));
  const belowReorder =
    row.trackInventory && reorderLevel != null && stockOnHand <= reorderLevel;
  return {
    id: row.id,
    name: row.name,
    itemType: row.itemType,
    sku: row.sku ?? null,
    unit: row.unit ?? null,
    description: row.description ?? null,
    sellingPrice: parseFloat(String(row.sellingPrice)),
    costPrice: parseFloat(String(row.costPrice)),
    taxRateId: row.taxRateId ?? null,
    taxRateName: tax?.name ?? null,
    taxRatePercent: tax != null ? parseFloat(String(tax.rate)) : null,
    trackInventory: row.trackInventory,
    stockOnHand,
    reorderLevel,
    belowReorder,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadTaxMap(): Promise<Map<number, TaxRateRow>> {
  const rates = await db.select().from(taxRatesTable);
  return new Map(rates.map((r) => [r.id, r as TaxRateRow]));
}

// GET /items
router.get("/items", async (req, res): Promise<void> => {
  let rows = await db.select().from(itemsTable).orderBy(desc(itemsTable.createdAt));
  if (req.query.type) {
    const t = String(req.query.type);
    rows = rows.filter((r) => r.itemType === t);
  }
  const taxById = await loadTaxMap();
  res.json(rows.map((r) => serializeItem(r, taxById)));
});

// POST /items
router.post("/items", async (req, res): Promise<void> => {
  const { name } = req.body;
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const b = req.body;
  const values: typeof itemsTable.$inferInsert = {
    name,
    ...(b.itemType != null ? { itemType: String(b.itemType) } : {}),
    ...(b.sku != null ? { sku: String(b.sku) } : {}),
    ...(b.unit != null ? { unit: String(b.unit) } : {}),
    ...(b.description != null ? { description: String(b.description) } : {}),
    ...(b.sellingPrice != null ? { sellingPrice: String(b.sellingPrice) } : {}),
    ...(b.costPrice != null ? { costPrice: String(b.costPrice) } : {}),
    ...("taxRateId" in b ? { taxRateId: b.taxRateId != null ? Number(b.taxRateId) : null } : {}),
    ...(b.trackInventory != null ? { trackInventory: Boolean(b.trackInventory) } : {}),
    ...(b.stockOnHand != null ? { stockOnHand: String(b.stockOnHand) } : {}),
    ...(b.reorderLevel != null ? { reorderLevel: String(b.reorderLevel) } : {}),
    ...(b.isActive != null ? { isActive: Boolean(b.isActive) } : {}),
  };
  const [inserted] = await db.insert(itemsTable).values(values).$returningId();
  const [row] = await db.select().from(itemsTable).where(eq(itemsTable.id, inserted.id));
  const taxById = await loadTaxMap();
  res.status(201).json(serializeItem(row, taxById));
});

// GET /items/:id
router.get("/items/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [row] = await db.select().from(itemsTable).where(eq(itemsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const taxById = await loadTaxMap();
  res.json(serializeItem(row, taxById));
});

// PATCH /items/:id
router.patch("/items/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [existing] = await db.select().from(itemsTable).where(eq(itemsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const b = req.body;
  const updates: Partial<typeof itemsTable.$inferInsert> = {};
  if (b.name != null) updates.name = String(b.name);
  if (b.itemType != null) updates.itemType = String(b.itemType);
  if ("sku" in b) updates.sku = b.sku != null ? String(b.sku) : null;
  if ("unit" in b) updates.unit = b.unit != null ? String(b.unit) : null;
  if ("description" in b) updates.description = b.description != null ? String(b.description) : null;
  if (b.sellingPrice != null) updates.sellingPrice = String(b.sellingPrice);
  if (b.costPrice != null) updates.costPrice = String(b.costPrice);
  if ("taxRateId" in b) updates.taxRateId = b.taxRateId != null ? Number(b.taxRateId) : null;
  if (b.trackInventory != null) updates.trackInventory = Boolean(b.trackInventory);
  if (b.stockOnHand != null) updates.stockOnHand = String(b.stockOnHand);
  if ("reorderLevel" in b) updates.reorderLevel = b.reorderLevel != null ? String(b.reorderLevel) : null;
  if (b.isActive != null) updates.isActive = Boolean(b.isActive);

  await db.update(itemsTable).set(updates).where(eq(itemsTable.id, id));
  const [row] = await db.select().from(itemsTable).where(eq(itemsTable.id, id));
  const taxById = await loadTaxMap();
  res.json(serializeItem(row, taxById));
});

// DELETE /items/:id
router.delete("/items/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [row] = await db.select().from(itemsTable).where(eq(itemsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(itemsTable).where(eq(itemsTable.id, id));
  res.sendStatus(204);
});

export default router;
