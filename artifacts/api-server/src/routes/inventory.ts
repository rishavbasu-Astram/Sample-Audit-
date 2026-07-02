import { Router, type IRouter } from "express";
import { eq, asc, desc } from "drizzle-orm";
import { db, inventoryMovementsTable, itemsTable } from "@workspace/db";
import type { InventoryMovementRow, ItemRow } from "@workspace/db";

const router: IRouter = Router();

const VALID_TYPES = ["purchase", "sale", "adjustment", "opening"] as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Pure weighted-average replay helper ──────────────────────────────────────
// Movements must be pre-sorted by date asc, then id asc.
// Returns { qty, avg, cogs } where qty = current stock on hand,
// avg = current weighted-average unit cost, cogs = total cost of goods sold.
function replay(movements: InventoryMovementRow[]): { qty: number; avg: number; cogs: number } {
  let qty = 0;
  let avg = 0;
  let cogs = 0;

  for (const m of movements) {
    const q = parseFloat(String(m.quantity));
    const cost = parseFloat(String(m.unitCost));
    const type = m.movementType;

    if (type === "purchase" || type === "opening") {
      const newQty = qty + q;
      avg = newQty > 0 ? (qty * avg + q * cost) / newQty : cost;
      qty = newQty;
    } else if (type === "sale") {
      cogs += q * avg;
      qty -= q;
    } else if (type === "adjustment") {
      // q may be negative (shrinkage).
      // If q > 0 and a unitCost was recorded (> 0), blend like a purchase.
      // Otherwise apply qty change only — negative shrinkage does not hit COGS.
      if (q > 0 && cost > 0) {
        const newQty = qty + q;
        avg = newQty > 0 ? (qty * avg + q * cost) / newQty : cost;
        qty = newQty;
      } else {
        qty += q;
      }
    }
  }

  return { qty, avg, cogs };
}

// ── Serializers ───────────────────────────────────────────────────────────────

function serializeMovement(m: InventoryMovementRow, itemName: string | null) {
  const quantity = parseFloat(String(m.quantity));
  const unitCost = parseFloat(String(m.unitCost));
  return {
    id: m.id,
    itemId: m.itemId,
    itemName: itemName ?? null,
    movementType: m.movementType,
    quantity,
    unitCost,
    totalValue: round2(Math.abs(quantity) * unitCost),
    date: m.date,
    reference: m.reference ?? null,
    notes: m.notes ?? null,
    createdAt: m.createdAt.toISOString(),
  };
}

// ── GET /inventory/movements ──────────────────────────────────────────────────
router.get("/inventory/movements", async (req, res): Promise<void> => {
  const rawItemId = req.query.itemId;
  let rows = await db
    .select()
    .from(inventoryMovementsTable)
    .orderBy(desc(inventoryMovementsTable.date), desc(inventoryMovementsTable.id));

  if (rawItemId !== undefined) {
    const itemId = parseInt(String(rawItemId), 10);
    rows = rows.filter((r) => r.itemId === itemId);
  }

  // Build item name map from a single items fetch.
  const items = await db.select({ id: itemsTable.id, name: itemsTable.name }).from(itemsTable);
  const itemNames = new Map<number, string>(items.map((i) => [i.id, i.name]));

  res.json(rows.map((r) => serializeMovement(r, itemNames.get(r.itemId) ?? null)));
});

// ── POST /inventory/movements ─────────────────────────────────────────────────
router.post("/inventory/movements", async (req, res): Promise<void> => {
  const b = req.body;

  // --- Guard: itemId ---
  const itemId = b.itemId != null ? Number(b.itemId) : NaN;
  if (!Number.isFinite(itemId)) {
    res.status(400).json({ error: "itemId is required and must be a number" });
    return;
  }

  const [item] = await db.select().from(itemsTable).where(eq(itemsTable.id, itemId));
  if (!item) {
    res.status(400).json({ error: "item not found" });
    return;
  }
  if (!item.trackInventory) {
    res.status(400).json({ error: "item does not track inventory" });
    return;
  }

  // --- Guard: movementType ---
  const movementType = String(b.movementType ?? "");
  if (!(VALID_TYPES as readonly string[]).includes(movementType)) {
    res.status(400).json({ error: `movementType must be one of: ${VALID_TYPES.join(", ")}` });
    return;
  }

  // --- Guard: quantity ---
  const quantity = b.quantity != null ? Number(b.quantity) : NaN;
  if (!Number.isFinite(quantity)) {
    res.status(400).json({ error: "quantity is required and must be a number" });
    return;
  }
  if (movementType === "adjustment") {
    if (quantity === 0) {
      res.status(400).json({ error: "quantity must not be zero for adjustment" });
      return;
    }
  } else {
    if (quantity <= 0) {
      res.status(400).json({ error: `quantity must be > 0 for ${movementType}` });
      return;
    }
  }

  // --- Guard: unitCost for purchase / opening ---
  const rawUnitCost = b.unitCost != null ? Number(b.unitCost) : undefined;
  if (movementType === "purchase" || movementType === "opening") {
    if (rawUnitCost === undefined || !Number.isFinite(rawUnitCost) || rawUnitCost < 0) {
      res.status(400).json({ error: "unitCost is required and must be >= 0 for purchase and opening movements" });
      return;
    }
  }

  // --- Resolve date ---
  const date = b.date ? String(b.date) : todayStr();
  const reference = b.reference ? String(b.reference) : null;
  const notes = b.notes ? String(b.notes) : null;

  // --- Load existing movements for this item (sorted for replay) ---
  const existing = await db
    .select()
    .from(inventoryMovementsTable)
    .where(eq(inventoryMovementsTable.itemId, itemId))
    .orderBy(asc(inventoryMovementsTable.date), asc(inventoryMovementsTable.id));

  // --- Bootstrap rule (comment) ---
  // Items seeded before this feature have stockOnHand populated but no movement rows.
  // On the item's FIRST movement, if stockOnHand > 0 we synthesise and insert an
  // 'opening' movement (quantity = stockOnHand, unitCost = costPrice, date = today,
  // notes = "Opening balance (auto)") so the movement ledger becomes the single
  // source of truth from this point forward. The requested movement is then applied
  // on top of that synthetic opening.
  // Edge case: if the user manually records an 'opening' as the first movement while
  // stockOnHand > 0, the auto-opening fires first and the manual one is appended on
  // top — which means the opening balance is double-counted. We follow the spec
  // literally; callers who want to avoid this should zero out stockOnHand first.
  let ledger = [...existing];
  if (existing.length === 0) {
    const seedQty = parseFloat(String(item.stockOnHand));
    if (seedQty > 0) {
      const seedCost = parseFloat(String(item.costPrice));
      const openingValues: typeof inventoryMovementsTable.$inferInsert = {
        itemId,
        date: todayStr(),
        movementType: "opening",
        quantity: String(seedQty),
        unitCost: String(seedCost),
        reference: null,
        notes: "Opening balance (auto)",
      };
      const [openingId] = await db.insert(inventoryMovementsTable).values(openingValues).$returningId();
      const [openingRow] = await db
        .select()
        .from(inventoryMovementsTable)
        .where(eq(inventoryMovementsTable.id, openingId.id));
      ledger = [openingRow];
    }
  }

  // --- Resolve unit cost for the requested movement ---
  let resolvedUnitCost: number;
  if (movementType === "purchase" || movementType === "opening") {
    resolvedUnitCost = rawUnitCost!;
  } else if (movementType === "sale") {
    // Cost is the current weighted-average from replaying existing ledger.
    // If ledger is still empty (stockOnHand was 0 so no bootstrap), avg = 0.
    const { qty: currentQty, avg } = replay(ledger);

    // Guard: cannot sell more than current stock.
    if (quantity > currentQty) {
      res.status(400).json({
        error: `sale quantity (${quantity}) exceeds current stock on hand (${round2(currentQty)})`,
      });
      return;
    }
    resolvedUnitCost = avg;
  } else {
    // adjustment: use provided unitCost if > 0, else replayed avg.
    if (rawUnitCost !== undefined && rawUnitCost > 0) {
      resolvedUnitCost = rawUnitCost;
    } else {
      const { avg } = replay(ledger);
      resolvedUnitCost = avg;
    }
  }

  // --- Insert the requested movement ---
  const insertValues: typeof inventoryMovementsTable.$inferInsert = {
    itemId,
    date,
    movementType,
    quantity: String(quantity),
    unitCost: String(resolvedUnitCost),
    reference,
    notes,
  };
  const [inserted] = await db.insert(inventoryMovementsTable).values(insertValues).$returningId();
  const [newRow] = await db
    .select()
    .from(inventoryMovementsTable)
    .where(eq(inventoryMovementsTable.id, inserted.id));

  // --- Recompute on-hand from the full ledger (including new row) ---
  const fullLedger = await db
    .select()
    .from(inventoryMovementsTable)
    .where(eq(inventoryMovementsTable.itemId, itemId))
    .orderBy(asc(inventoryMovementsTable.date), asc(inventoryMovementsTable.id));
  const { qty: newQty } = replay(fullLedger);
  await db
    .update(itemsTable)
    .set({ stockOnHand: String(round2(newQty)) })
    .where(eq(itemsTable.id, itemId));

  res.status(201).json(serializeMovement(newRow, item.name));
});

// ── GET /inventory/valuation ──────────────────────────────────────────────────
router.get("/inventory/valuation", async (_req, res): Promise<void> => {
  // Load all tracked items.
  const trackedItems = await db
    .select()
    .from(itemsTable)
    .orderBy(asc(itemsTable.name));
  const tracked = trackedItems.filter((i) => i.trackInventory);

  // Load all movements in one query, sorted for replay.
  const allMovements = await db
    .select()
    .from(inventoryMovementsTable)
    .orderBy(asc(inventoryMovementsTable.date), asc(inventoryMovementsTable.id));

  // Group movements by itemId.
  const byItem = new Map<number, InventoryMovementRow[]>();
  for (const m of allMovements) {
    const arr = byItem.get(m.itemId) ?? [];
    arr.push(m);
    byItem.set(m.itemId, arr);
  }

  const rows = tracked.map((item: ItemRow) => {
    const movements = byItem.get(item.id);
    if (movements && movements.length > 0) {
      // Items with a movement ledger: replay for authoritative figures.
      const { qty, avg, cogs } = replay(movements);
      return {
        itemId: item.id,
        itemName: item.name,
        sku: item.sku ?? null,
        quantityOnHand: qty,
        avgUnitCost: round4(avg),
        stockValue: round2(qty * avg),
        cogsToDate: round2(cogs),
      };
    } else {
      // Items seeded before the inventory feature was introduced have no movements yet.
      // Fall back to the item record's stockOnHand / costPrice so they still appear in
      // the valuation report rather than showing zeros.
      const qty = parseFloat(String(item.stockOnHand));
      const cost = parseFloat(String(item.costPrice));
      return {
        itemId: item.id,
        itemName: item.name,
        sku: item.sku ?? null,
        quantityOnHand: qty,
        avgUnitCost: round4(cost),
        stockValue: round2(qty * cost),
        cogsToDate: 0,
      };
    }
  });

  const totalStockValue = round2(rows.reduce((s, r) => s + r.stockValue, 0));
  const totalCogs = round2(rows.reduce((s, r) => s + r.cogsToDate, 0));

  res.json({
    asOf: todayStr(),
    rows,
    totalStockValue,
    totalCogs,
  });
});

export default router;
