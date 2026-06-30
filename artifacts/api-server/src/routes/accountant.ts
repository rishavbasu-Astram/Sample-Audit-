import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  chartOfAccountsTable,
  journalsTable,
  budgetsTable,
  vatPaymentsTable,
  currencyAdjustmentsTable,
  transactionLocksTable,
} from "@workspace/db";

const router: IRouter = Router();

// ── CHART OF ACCOUNTS ─────────────────────────────────────────────────────────
router.get("/chart-of-accounts", async (req, res): Promise<void> => {
  const { type } = req.query;
  let rows = await db.select().from(chartOfAccountsTable).orderBy(sql`code asc`);
  if (type) rows = rows.filter((a) => a.type === String(type));
  res.json(rows.map((a) => ({ ...a, balance: parseFloat(String(a.balance)), createdAt: a.createdAt.toISOString() })));
});

router.post("/chart-of-accounts", async (req, res): Promise<void> => {
  const { code, name, type, subtype, description } = req.body;
  if (!code || !name || !type) { res.status(400).json({ error: "Missing required fields" }); return; }
  const [a] = await db.insert(chartOfAccountsTable).values({ code, name, type, subtype, description }).returning();
  res.status(201).json({ ...a, balance: parseFloat(String(a.balance)), createdAt: a.createdAt.toISOString() });
});

router.get("/chart-of-accounts/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [a] = await db.select().from(chartOfAccountsTable).where(eq(chartOfAccountsTable.id, id));
  if (!a) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...a, balance: parseFloat(String(a.balance)), createdAt: a.createdAt.toISOString() });
});

router.patch("/chart-of-accounts/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["name","description","isActive"]) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  const [a] = await db.update(chartOfAccountsTable).set(updates).where(eq(chartOfAccountsTable.id, id)).returning();
  if (!a) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...a, balance: parseFloat(String(a.balance)), createdAt: a.createdAt.toISOString() });
});

router.delete("/chart-of-accounts/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [a] = await db.delete(chartOfAccountsTable).where(eq(chartOfAccountsTable.id, id)).returning();
  if (!a) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

// ── JOURNALS ──────────────────────────────────────────────────────────────────
router.get("/journals", async (req, res): Promise<void> => {
  const { type } = req.query;
  let rows = await db.select().from(journalsTable).orderBy(sql`created_at desc`);
  if (type) rows = rows.filter((j) => j.type === String(type));
  res.json(rows.map((j) => ({ ...j, entries: (j.entries as unknown[]) ?? [], createdAt: j.createdAt.toISOString() })));
});

router.post("/journals", async (req, res): Promise<void> => {
  const { type, date, reference, notes, entries, frequency, nextDate } = req.body;
  if (!type || !date || !entries) { res.status(400).json({ error: "Missing required fields" }); return; }
  const journalNumber = `JNL-${Date.now()}`;
  const [j] = await db.insert(journalsTable).values({ journalNumber, type, date, reference, notes, entries, frequency, nextDate }).returning();
  res.status(201).json({ ...j, entries: (j.entries as unknown[]) ?? [], createdAt: j.createdAt.toISOString() });
});

router.get("/journals/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [j] = await db.select().from(journalsTable).where(eq(journalsTable.id, id));
  if (!j) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...j, entries: (j.entries as unknown[]) ?? [], createdAt: j.createdAt.toISOString() });
});

router.patch("/journals/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["notes","status","entries"]) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  const [j] = await db.update(journalsTable).set(updates).where(eq(journalsTable.id, id)).returning();
  if (!j) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...j, entries: (j.entries as unknown[]) ?? [], createdAt: j.createdAt.toISOString() });
});

router.delete("/journals/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [j] = await db.delete(journalsTable).where(eq(journalsTable.id, id)).returning();
  if (!j) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

// ── BUDGETS ───────────────────────────────────────────────────────────────────
router.get("/budgets", async (req, res): Promise<void> => {
  const rows = await db.select().from(budgetsTable).orderBy(sql`created_at desc`);
  res.json(rows.map((b) => ({ ...b, totalBudgeted: parseFloat(String(b.totalBudgeted)), totalActual: parseFloat(String(b.totalActual)), lines: (b.lines as unknown[]) ?? [], createdAt: b.createdAt.toISOString() })));
});

router.post("/budgets", async (req, res): Promise<void> => {
  const { name, fiscalYear, period, lines } = req.body;
  if (!name || !fiscalYear || !period || !lines) { res.status(400).json({ error: "Missing required fields" }); return; }
  const totalBudgeted = (lines as { budgeted?: number }[]).reduce((s, l) => s + (l.budgeted ?? 0), 0);
  const [b] = await db.insert(budgetsTable).values({ name, fiscalYear, period, lines, totalBudgeted: String(totalBudgeted), totalActual: "0" }).returning();
  res.status(201).json({ ...b, totalBudgeted: parseFloat(String(b.totalBudgeted)), totalActual: parseFloat(String(b.totalActual)), lines: (b.lines as unknown[]) ?? [], createdAt: b.createdAt.toISOString() });
});

router.get("/budgets/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [b] = await db.select().from(budgetsTable).where(eq(budgetsTable.id, id));
  if (!b) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...b, totalBudgeted: parseFloat(String(b.totalBudgeted)), totalActual: parseFloat(String(b.totalActual)), lines: (b.lines as unknown[]) ?? [], createdAt: b.createdAt.toISOString() });
});

router.patch("/budgets/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["name","status","lines"]) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  const [b] = await db.update(budgetsTable).set(updates).where(eq(budgetsTable.id, id)).returning();
  if (!b) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...b, totalBudgeted: parseFloat(String(b.totalBudgeted)), totalActual: parseFloat(String(b.totalActual)), lines: (b.lines as unknown[]) ?? [], createdAt: b.createdAt.toISOString() });
});

router.delete("/budgets/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [b] = await db.delete(budgetsTable).where(eq(budgetsTable.id, id)).returning();
  if (!b) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

// ── VAT PAYMENTS ──────────────────────────────────────────────────────────────
router.get("/vat-payments", async (req, res): Promise<void> => {
  const rows = await db.select().from(vatPaymentsTable).orderBy(sql`created_at desc`);
  res.json(rows.map((v) => ({ ...v, vatCollected: parseFloat(String(v.vatCollected)), vatPaid: parseFloat(String(v.vatPaid)), netVat: parseFloat(String(v.netVat)), createdAt: v.createdAt.toISOString() })));
});

router.post("/vat-payments", async (req, res): Promise<void> => {
  const { period, dueDate, vatCollected, vatPaid, notes } = req.body;
  if (!period || !dueDate || vatCollected == null || vatPaid == null) { res.status(400).json({ error: "Missing required fields" }); return; }
  const netVat = parseFloat(String(vatCollected)) - parseFloat(String(vatPaid));
  const [v] = await db.insert(vatPaymentsTable).values({ period, dueDate, vatCollected: String(vatCollected), vatPaid: String(vatPaid), netVat: String(netVat), notes }).returning();
  res.status(201).json({ ...v, vatCollected: parseFloat(String(v.vatCollected)), vatPaid: parseFloat(String(v.vatPaid)), netVat: parseFloat(String(v.netVat)), createdAt: v.createdAt.toISOString() });
});

router.get("/vat-payments/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [v] = await db.select().from(vatPaymentsTable).where(eq(vatPaymentsTable.id, id));
  if (!v) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...v, vatCollected: parseFloat(String(v.vatCollected)), vatPaid: parseFloat(String(v.vatPaid)), netVat: parseFloat(String(v.netVat)), createdAt: v.createdAt.toISOString() });
});

router.delete("/vat-payments/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [v] = await db.delete(vatPaymentsTable).where(eq(vatPaymentsTable.id, id)).returning();
  if (!v) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

// ── CURRENCY ADJUSTMENTS ──────────────────────────────────────────────────────
router.get("/currency-adjustments", async (req, res): Promise<void> => {
  const rows = await db.select().from(currencyAdjustmentsTable).orderBy(sql`created_at desc`);
  res.json(rows.map((r) => ({ ...r, exchangeRate: parseFloat(String(r.exchangeRate)), adjustmentAmount: parseFloat(String(r.adjustmentAmount)), createdAt: r.createdAt.toISOString() })));
});

router.post("/currency-adjustments", async (req, res): Promise<void> => {
  const { date, fromCurrency, toCurrency, exchangeRate, adjustmentAmount, notes } = req.body;
  if (!date || !fromCurrency || !toCurrency || exchangeRate == null || adjustmentAmount == null) { res.status(400).json({ error: "Missing required fields" }); return; }
  const [r] = await db.insert(currencyAdjustmentsTable).values({ date, fromCurrency, toCurrency, exchangeRate: String(exchangeRate), adjustmentAmount: String(adjustmentAmount), notes }).returning();
  res.status(201).json({ ...r, exchangeRate: parseFloat(String(r.exchangeRate)), adjustmentAmount: parseFloat(String(r.adjustmentAmount)), createdAt: r.createdAt.toISOString() });
});

router.get("/currency-adjustments/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(currencyAdjustmentsTable).where(eq(currencyAdjustmentsTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...r, exchangeRate: parseFloat(String(r.exchangeRate)), adjustmentAmount: parseFloat(String(r.adjustmentAmount)), createdAt: r.createdAt.toISOString() });
});

router.delete("/currency-adjustments/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.delete(currencyAdjustmentsTable).where(eq(currencyAdjustmentsTable.id, id)).returning();
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

// ── TRANSACTION LOCKS ─────────────────────────────────────────────────────────
router.get("/transaction-locks", async (req, res): Promise<void> => {
  const rows = await db.select().from(transactionLocksTable).orderBy(sql`lock_date desc`);
  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/transaction-locks", async (req, res): Promise<void> => {
  const { lockDate, description } = req.body;
  if (!lockDate) { res.status(400).json({ error: "lockDate is required" }); return; }
  const [r] = await db.insert(transactionLocksTable).values({ lockDate, description }).returning();
  res.status(201).json({ ...r, createdAt: r.createdAt.toISOString() });
});

router.delete("/transaction-locks/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.delete(transactionLocksTable).where(eq(transactionLocksTable.id, id)).returning();
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

export default router;
