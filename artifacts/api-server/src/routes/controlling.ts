import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  costCentersTable,
  productsTable,
  invoicesTable,
  billsTable,
  expensesTable,
  customersTable,
} from "@workspace/db";

const router: IRouter = Router();

// ── COST CENTERS ────────────────────────────────────────────────────────────
type CostCenterRow = typeof costCentersTable.$inferSelect;
function serializeCostCenter(c: CostCenterRow) {
  const budgetedAmount = parseFloat(String(c.budgetedAmount));
  const actualAmount = parseFloat(String(c.actualAmount));
  return {
    ...c,
    budgetedAmount,
    actualAmount,
    variance: budgetedAmount - actualAmount,
    createdAt: c.createdAt.toISOString(),
  };
}

router.get("/cost-centers", async (_req, res): Promise<void> => {
  const rows = await db.select().from(costCentersTable).orderBy(sql`code asc`);
  res.json(rows.map(serializeCostCenter));
});

router.post("/cost-centers", async (req, res): Promise<void> => {
  const { code, name, manager, parentId, budgetedAmount, actualAmount } = req.body;
  if (!code || !name) { res.status(400).json({ error: "code and name are required" }); return; }
  const [inserted] = await db
    .insert(costCentersTable)
    .values({
      code,
      name,
      manager,
      parentId: parentId ?? null,
      budgetedAmount: String(budgetedAmount ?? 0),
      actualAmount: String(actualAmount ?? 0),
    })
    .$returningId();
  const [c] = await db.select().from(costCentersTable).where(eq(costCentersTable.id, inserted.id));
  res.status(201).json(serializeCostCenter(c));
});

router.get("/cost-centers/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [c] = await db.select().from(costCentersTable).where(eq(costCentersTable.id, id));
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeCostCenter(c));
});

router.patch("/cost-centers/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["name", "manager", "parentId", "isActive"]) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  for (const f of ["budgetedAmount", "actualAmount"]) {
    if (req.body[f] !== undefined) updates[f] = String(req.body[f]);
  }
  await db.update(costCentersTable).set(updates).where(eq(costCentersTable.id, id));
  const [c] = await db.select().from(costCentersTable).where(eq(costCentersTable.id, id));
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeCostCenter(c));
});

router.delete("/cost-centers/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [c] = await db.select().from(costCentersTable).where(eq(costCentersTable.id, id));
  if (!c) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(costCentersTable).where(eq(costCentersTable.id, id));
  res.sendStatus(204);
});

// ── PRODUCTS (COST CONTROLLING) ─────────────────────────────────────────────
type ProductRow = typeof productsTable.$inferSelect;
function serializeProduct(p: ProductRow) {
  const standardCost = parseFloat(String(p.standardCost));
  const actualCost = parseFloat(String(p.actualCost));
  const quantity = parseFloat(String(p.quantity));
  const unitVariance = actualCost - standardCost; // positive = actual over standard (unfavourable)
  return {
    ...p,
    standardCost,
    actualCost,
    quantity,
    unitVariance,
    totalVariance: unitVariance * quantity,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/products", async (_req, res): Promise<void> => {
  const rows = await db.select().from(productsTable).orderBy(sql`code asc`);
  res.json(rows.map(serializeProduct));
});

router.post("/products", async (req, res): Promise<void> => {
  const { code, name, category, unit, standardCost, actualCost, quantity } = req.body;
  if (!code || !name) { res.status(400).json({ error: "code and name are required" }); return; }
  const [inserted] = await db
    .insert(productsTable)
    .values({
      code,
      name,
      category,
      unit,
      standardCost: String(standardCost ?? 0),
      actualCost: String(actualCost ?? 0),
      quantity: String(quantity ?? 0),
    })
    .$returningId();
  const [p] = await db.select().from(productsTable).where(eq(productsTable.id, inserted.id));
  res.status(201).json(serializeProduct(p));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [p] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeProduct(p));
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["name", "category", "unit", "isActive"]) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  for (const f of ["standardCost", "actualCost", "quantity"]) {
    if (req.body[f] !== undefined) updates[f] = String(req.body[f]);
  }
  await db.update(productsTable).set(updates).where(eq(productsTable.id, id));
  const [p] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  res.json(serializeProduct(p));
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [p] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(productsTable).where(eq(productsTable.id, id));
  res.sendStatus(204);
});

// ── PROFITABILITY ANALYSIS (accrual, ex-tax) ────────────────────────────────
// Revenue = invoices.subtotal; Cost = bills.subtotal + expenses.amount.
// Tax is excluded (subtotal, not total) so VAT does not distort margin.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

router.get("/reports/profitability", async (_req, res): Promise<void> => {
  const [invoices, bills, expenses, customers] = await Promise.all([
    db.select({ date: invoicesTable.date, subtotal: invoicesTable.subtotal, customerId: invoicesTable.customerId }).from(invoicesTable),
    db.select({ date: billsTable.date, subtotal: billsTable.subtotal }).from(billsTable),
    db.select({ date: expensesTable.date, amount: expensesTable.amount }).from(expensesTable),
    db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable),
  ]);

  const sumWhere = <T extends { date: string }>(rows: T[], prefix: string, field: keyof T) =>
    rows
      .filter((r) => String(r.date).startsWith(prefix))
      .reduce((s, r) => s + parseFloat(String(r[field] ?? 0)), 0);

  const now = new Date();
  const currentMonth = now.getMonth();

  const byMonth = [];
  for (let i = 5; i >= 0; i--) {
    const monthIndex = (currentMonth - i + 12) % 12;
    const year = now.getFullYear() - (currentMonth - i < 0 ? 1 : 0);
    const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
    const revenue = sumWhere(invoices, prefix, "subtotal");
    const cost = sumWhere(bills, prefix, "subtotal") + sumWhere(expenses, prefix, "amount");
    const grossProfit = revenue - cost;
    byMonth.push({
      period: MONTHS[monthIndex],
      revenue,
      cost,
      grossProfit,
      margin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    });
  }

  const totalRevenue = byMonth.reduce((s, m) => s + m.revenue, 0);
  const totalCost = byMonth.reduce((s, m) => s + m.cost, 0);
  const grossProfit = totalRevenue - totalCost;

  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const revenueByCustomer = new Map<number, number>();
  for (const inv of invoices) {
    revenueByCustomer.set(inv.customerId, (revenueByCustomer.get(inv.customerId) ?? 0) + parseFloat(String(inv.subtotal)));
  }
  const byCustomer = [...revenueByCustomer.entries()]
    .map(([customerId, revenue]) => ({ customerId, customerName: customerName.get(customerId) ?? `Customer ${customerId}`, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  res.json({
    summary: {
      revenue: totalRevenue,
      cost: totalCost,
      grossProfit,
      margin: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
    },
    byMonth,
    byCustomer,
  });
});

export default router;
