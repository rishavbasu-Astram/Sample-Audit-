import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  vendorsTable,
  expensesTable,
  recurringExpensesTable,
  purchaseOrdersTable,
  billsTable,
  recurringBillsTable,
  paymentsMadeTable,
  vendorCreditsTable,
} from "@workspace/db";

const router: IRouter = Router();

async function getVendorName(id: number): Promise<string> {
  const [v] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, id));
  return v?.name ?? "Unknown";
}

function fv(v: typeof vendorsTable.$inferSelect) {
  return { ...v, outstandingBalance: parseFloat(String(v.outstandingBalance)), createdAt: v.createdAt.toISOString() };
}

// ── VENDORS ───────────────────────────────────────────────────────────────────
router.get("/vendors", async (req, res): Promise<void> => {
  const { search } = req.query;
  let rows = await db.select().from(vendorsTable).orderBy(sql`created_at desc`);
  if (search) { const s = String(search).toLowerCase(); rows = rows.filter((v) => v.name.toLowerCase().includes(s)); }
  res.json(rows.map(fv));
});

router.post("/vendors", async (req, res): Promise<void> => {
  const { name, email, phone, company, address, taxNumber, currency } = req.body;
  if (!name) { res.status(400).json({ error: "Name is required" }); return; }
  const [inserted] = await db.insert(vendorsTable).values({ name, email, phone, company, address, taxNumber, currency: currency ?? "USD" }).$returningId();
  const [v] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, inserted.id));
  res.status(201).json(fv(v));
});

router.get("/vendors/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [v] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id));
  if (!v) { res.status(404).json({ error: "Vendor not found" }); return; }
  res.json(fv(v));
});

router.patch("/vendors/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["name","email","phone","company","address","currency"]) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  await db.update(vendorsTable).set(updates).where(eq(vendorsTable.id, id));
  const [v] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id));
  if (!v) { res.status(404).json({ error: "Vendor not found" }); return; }
  res.json(fv(v));
});

router.delete("/vendors/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [v] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id));
  if (!v) { res.status(404).json({ error: "Vendor not found" }); return; }
  await db.delete(vendorsTable).where(eq(vendorsTable.id, id));
  res.sendStatus(204);
});

// ── EXPENSES ──────────────────────────────────────────────────────────────────
router.get("/expenses", async (req, res): Promise<void> => {
  const { vendorId, category } = req.query;
  let rows = await db.select().from(expensesTable).orderBy(sql`created_at desc`);
  if (vendorId) rows = rows.filter((e) => e.vendorId === parseInt(String(vendorId), 10));
  if (category) rows = rows.filter((e) => e.category === String(category));
  const vendors = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable);
  const nameMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  res.json(rows.map((e) => ({ ...e, vendorName: e.vendorId ? (nameMap[e.vendorId] ?? null) : null, amount: parseFloat(String(e.amount)), taxAmount: parseFloat(String(e.taxAmount)), total: parseFloat(String(e.total)), createdAt: e.createdAt.toISOString() })));
});

router.post("/expenses", async (req, res): Promise<void> => {
  const { vendorId, date, category, amount, taxAmount, paymentMethod, reference, notes } = req.body;
  if (!date || !category || amount == null || !paymentMethod) { res.status(400).json({ error: "Missing required fields" }); return; }
  const tax = taxAmount ?? 0;
  const total = parseFloat(String(amount)) + parseFloat(String(tax));
  const [inserted] = await db.insert(expensesTable).values({ vendorId, date, category, amount: String(amount), taxAmount: String(tax), total: String(total), paymentMethod, reference, notes }).$returningId();
  const [e] = await db.select().from(expensesTable).where(eq(expensesTable.id, inserted.id));
  const vendorName = vendorId ? await getVendorName(vendorId) : null;
  res.status(201).json({ ...e, vendorName, amount: parseFloat(String(e.amount)), taxAmount: parseFloat(String(e.taxAmount)), total: parseFloat(String(e.total)), createdAt: e.createdAt.toISOString() });
});

router.get("/expenses/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [e] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  const vendorName = e.vendorId ? await getVendorName(e.vendorId) : null;
  res.json({ ...e, vendorName, amount: parseFloat(String(e.amount)), taxAmount: parseFloat(String(e.taxAmount)), total: parseFloat(String(e.total)), createdAt: e.createdAt.toISOString() });
});

router.patch("/expenses/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["category","notes"]) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  if (req.body.amount !== undefined) updates.amount = String(req.body.amount);
  if (req.body.taxAmount !== undefined) updates.taxAmount = String(req.body.taxAmount);
  await db.update(expensesTable).set(updates).where(eq(expensesTable.id, id));
  const [e] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  const vendorName = e.vendorId ? await getVendorName(e.vendorId) : null;
  res.json({ ...e, vendorName, amount: parseFloat(String(e.amount)), taxAmount: parseFloat(String(e.taxAmount)), total: parseFloat(String(e.total)), createdAt: e.createdAt.toISOString() });
});

router.delete("/expenses/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [e] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(expensesTable).where(eq(expensesTable.id, id));
  res.sendStatus(204);
});

// ── RECURRING EXPENSES ────────────────────────────────────────────────────────
router.get("/recurring-expenses", async (req, res): Promise<void> => {
  const rows = await db.select().from(recurringExpensesTable).orderBy(sql`created_at desc`);
  const vendors = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable);
  const nameMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  res.json(rows.map((r) => ({ ...r, vendorName: r.vendorId ? (nameMap[r.vendorId] ?? null) : null, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() })));
});

router.post("/recurring-expenses", async (req, res): Promise<void> => {
  const { vendorId, category, amount, frequency, nextDate, notes } = req.body;
  if (!category || amount == null || !frequency || !nextDate) { res.status(400).json({ error: "Missing required fields" }); return; }
  const [inserted] = await db.insert(recurringExpensesTable).values({ vendorId, category, amount: String(amount), frequency, nextDate, notes }).$returningId();
  const [r] = await db.select().from(recurringExpensesTable).where(eq(recurringExpensesTable.id, inserted.id));
  const vendorName = vendorId ? await getVendorName(vendorId) : null;
  res.status(201).json({ ...r, vendorName, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() });
});

router.get("/recurring-expenses/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(recurringExpensesTable).where(eq(recurringExpensesTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  const vendorName = r.vendorId ? await getVendorName(r.vendorId) : null;
  res.json({ ...r, vendorName, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() });
});

router.patch("/recurring-expenses/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["frequency","nextDate","status"]) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  if (req.body.amount !== undefined) updates.amount = String(req.body.amount);
  await db.update(recurringExpensesTable).set(updates).where(eq(recurringExpensesTable.id, id));
  const [r] = await db.select().from(recurringExpensesTable).where(eq(recurringExpensesTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  const vendorName = r.vendorId ? await getVendorName(r.vendorId) : null;
  res.json({ ...r, vendorName, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() });
});

router.delete("/recurring-expenses/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(recurringExpensesTable).where(eq(recurringExpensesTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(recurringExpensesTable).where(eq(recurringExpensesTable.id, id));
  res.sendStatus(204);
});

// ── PURCHASE ORDERS ───────────────────────────────────────────────────────────
router.get("/purchase-orders", async (req, res): Promise<void> => {
  const { status, vendorId } = req.query;
  let rows = await db.select().from(purchaseOrdersTable).orderBy(sql`created_at desc`);
  if (status) rows = rows.filter((o) => o.status === String(status));
  if (vendorId) rows = rows.filter((o) => o.vendorId === parseInt(String(vendorId), 10));
  const vendors = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable);
  const nameMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  res.json(rows.map((o) => ({ ...o, vendorName: nameMap[o.vendorId] ?? "Unknown", subtotal: parseFloat(String(o.subtotal)), taxAmount: parseFloat(String(o.taxAmount)), total: parseFloat(String(o.total)), lineItems: (o.lineItems as unknown[]) ?? [], createdAt: o.createdAt.toISOString() })));
});

router.post("/purchase-orders", async (req, res): Promise<void> => {
  const { vendorId, date, expectedDate, notes, lineItems } = req.body;
  if (!vendorId || !date) { res.status(400).json({ error: "Missing required fields" }); return; }
  const items = lineItems ?? [];
  const subtotal = items.reduce((s: number, li: { amount?: number }) => s + (li.amount ?? 0), 0);
  const taxAmount = items.reduce((s: number, li: { taxRate?: number; amount?: number }) => s + ((li.taxRate ?? 0) / 100) * (li.amount ?? 0), 0);
  const total = subtotal + taxAmount;
  const poNumber = `PO-${Date.now()}`;
  const [inserted] = await db.insert(purchaseOrdersTable).values({ poNumber, vendorId, date, expectedDate, notes, lineItems: items, subtotal: String(subtotal), taxAmount: String(taxAmount), total: String(total) }).$returningId();
  const [o] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, inserted.id));
  const name = await getVendorName(vendorId);
  res.status(201).json({ ...o, vendorName: name, subtotal: parseFloat(String(o.subtotal)), taxAmount: parseFloat(String(o.taxAmount)), total: parseFloat(String(o.total)), lineItems: (o.lineItems as unknown[]) ?? [], createdAt: o.createdAt.toISOString() });
});

router.get("/purchase-orders/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [o] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!o) { res.status(404).json({ error: "Not found" }); return; }
  const name = await getVendorName(o.vendorId);
  res.json({ ...o, vendorName: name, subtotal: parseFloat(String(o.subtotal)), taxAmount: parseFloat(String(o.taxAmount)), total: parseFloat(String(o.total)), lineItems: (o.lineItems as unknown[]) ?? [], createdAt: o.createdAt.toISOString() });
});

router.patch("/purchase-orders/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["expectedDate","status","notes"]) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  await db.update(purchaseOrdersTable).set(updates).where(eq(purchaseOrdersTable.id, id));
  const [o] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!o) { res.status(404).json({ error: "Not found" }); return; }
  const name = await getVendorName(o.vendorId);
  res.json({ ...o, vendorName: name, subtotal: parseFloat(String(o.subtotal)), taxAmount: parseFloat(String(o.taxAmount)), total: parseFloat(String(o.total)), lineItems: (o.lineItems as unknown[]) ?? [], createdAt: o.createdAt.toISOString() });
});

router.delete("/purchase-orders/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [o] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!o) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  res.sendStatus(204);
});

// ── BILLS ─────────────────────────────────────────────────────────────────────
router.get("/bills", async (req, res): Promise<void> => {
  const { status, vendorId, overdue } = req.query;
  let rows = await db.select().from(billsTable).orderBy(sql`created_at desc`);
  const today = new Date().toISOString().split("T")[0];
  if (status) rows = rows.filter((b) => b.status === String(status));
  if (vendorId) rows = rows.filter((b) => b.vendorId === parseInt(String(vendorId), 10));
  if (overdue === "true") rows = rows.filter((b) => b.dueDate < today && !["paid","cancelled"].includes(b.status));
  const vendors = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable);
  const nameMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  res.json(rows.map((b) => ({ ...b, vendorName: nameMap[b.vendorId] ?? "Unknown", subtotal: parseFloat(String(b.subtotal)), taxAmount: parseFloat(String(b.taxAmount)), total: parseFloat(String(b.total)), amountPaid: parseFloat(String(b.amountPaid)), amountDue: parseFloat(String(b.amountDue)), lineItems: (b.lineItems as unknown[]) ?? [], createdAt: b.createdAt.toISOString() })));
});

router.post("/bills", async (req, res): Promise<void> => {
  const { vendorId, date, dueDate, notes, lineItems } = req.body;
  if (!vendorId || !date || !dueDate) { res.status(400).json({ error: "Missing required fields" }); return; }
  const items = lineItems ?? [];
  const subtotal = items.reduce((s: number, li: { amount?: number }) => s + (li.amount ?? 0), 0);
  const taxAmount = items.reduce((s: number, li: { taxRate?: number; amount?: number }) => s + ((li.taxRate ?? 0) / 100) * (li.amount ?? 0), 0);
  const total = subtotal + taxAmount;
  const billNumber = `BILL-${Date.now()}`;
  const [inserted] = await db.insert(billsTable).values({ billNumber, vendorId, date, dueDate, notes, lineItems: items, subtotal: String(subtotal), taxAmount: String(taxAmount), total: String(total), amountDue: String(total), amountPaid: "0" }).$returningId();
  const [b] = await db.select().from(billsTable).where(eq(billsTable.id, inserted.id));
  const name = await getVendorName(vendorId);
  res.status(201).json({ ...b, vendorName: name, subtotal: parseFloat(String(b.subtotal)), taxAmount: parseFloat(String(b.taxAmount)), total: parseFloat(String(b.total)), amountPaid: parseFloat(String(b.amountPaid)), amountDue: parseFloat(String(b.amountDue)), lineItems: (b.lineItems as unknown[]) ?? [], createdAt: b.createdAt.toISOString() });
});

router.get("/bills/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [b] = await db.select().from(billsTable).where(eq(billsTable.id, id));
  if (!b) { res.status(404).json({ error: "Not found" }); return; }
  const name = await getVendorName(b.vendorId);
  res.json({ ...b, vendorName: name, subtotal: parseFloat(String(b.subtotal)), taxAmount: parseFloat(String(b.taxAmount)), total: parseFloat(String(b.total)), amountPaid: parseFloat(String(b.amountPaid)), amountDue: parseFloat(String(b.amountDue)), lineItems: (b.lineItems as unknown[]) ?? [], createdAt: b.createdAt.toISOString() });
});

router.patch("/bills/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["dueDate","status","notes"]) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  await db.update(billsTable).set(updates).where(eq(billsTable.id, id));
  const [b] = await db.select().from(billsTable).where(eq(billsTable.id, id));
  if (!b) { res.status(404).json({ error: "Not found" }); return; }
  const name = await getVendorName(b.vendorId);
  res.json({ ...b, vendorName: name, subtotal: parseFloat(String(b.subtotal)), taxAmount: parseFloat(String(b.taxAmount)), total: parseFloat(String(b.total)), amountPaid: parseFloat(String(b.amountPaid)), amountDue: parseFloat(String(b.amountDue)), lineItems: (b.lineItems as unknown[]) ?? [], createdAt: b.createdAt.toISOString() });
});

router.delete("/bills/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [b] = await db.select().from(billsTable).where(eq(billsTable.id, id));
  if (!b) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(billsTable).where(eq(billsTable.id, id));
  res.sendStatus(204);
});

// ── RECURRING BILLS ───────────────────────────────────────────────────────────
router.get("/recurring-bills", async (req, res): Promise<void> => {
  const rows = await db.select().from(recurringBillsTable).orderBy(sql`created_at desc`);
  const vendors = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable);
  const nameMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  res.json(rows.map((r) => ({ ...r, vendorName: nameMap[r.vendorId] ?? "Unknown", amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() })));
});

router.post("/recurring-bills", async (req, res): Promise<void> => {
  const { vendorId, frequency, nextDate, amount, notes } = req.body;
  if (!vendorId || !frequency || !nextDate || amount == null) { res.status(400).json({ error: "Missing required fields" }); return; }
  const [inserted] = await db.insert(recurringBillsTable).values({ vendorId, frequency, nextDate, amount: String(amount), notes }).$returningId();
  const [r] = await db.select().from(recurringBillsTable).where(eq(recurringBillsTable.id, inserted.id));
  const name = await getVendorName(vendorId);
  res.status(201).json({ ...r, vendorName: name, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() });
});

router.get("/recurring-bills/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(recurringBillsTable).where(eq(recurringBillsTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  const name = await getVendorName(r.vendorId);
  res.json({ ...r, vendorName: name, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() });
});

router.patch("/recurring-bills/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["frequency","nextDate","status"]) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  if (req.body.amount !== undefined) updates.amount = String(req.body.amount);
  await db.update(recurringBillsTable).set(updates).where(eq(recurringBillsTable.id, id));
  const [r] = await db.select().from(recurringBillsTable).where(eq(recurringBillsTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  const name = await getVendorName(r.vendorId);
  res.json({ ...r, vendorName: name, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() });
});

router.delete("/recurring-bills/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(recurringBillsTable).where(eq(recurringBillsTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(recurringBillsTable).where(eq(recurringBillsTable.id, id));
  res.sendStatus(204);
});

// ── PAYMENTS MADE ─────────────────────────────────────────────────────────────
router.get("/payments-made", async (req, res): Promise<void> => {
  const { vendorId } = req.query;
  let rows = await db.select().from(paymentsMadeTable).orderBy(sql`created_at desc`);
  if (vendorId) rows = rows.filter((r) => r.vendorId === parseInt(String(vendorId), 10));
  const vendors = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable);
  const nameMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  res.json(rows.map((r) => ({ ...r, vendorName: nameMap[r.vendorId] ?? "Unknown", amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() })));
});

router.post("/payments-made", async (req, res): Promise<void> => {
  const { vendorId, date, amount, paymentMethod, reference, billId, notes } = req.body;
  if (!vendorId || !date || amount == null || !paymentMethod) { res.status(400).json({ error: "Missing required fields" }); return; }
  const [inserted] = await db.insert(paymentsMadeTable).values({ vendorId, date, amount: String(amount), paymentMethod, reference, billId, notes }).$returningId();
  const [r] = await db.select().from(paymentsMadeTable).where(eq(paymentsMadeTable.id, inserted.id));
  const name = await getVendorName(vendorId);
  res.status(201).json({ ...r, vendorName: name, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() });
});

router.get("/payments-made/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(paymentsMadeTable).where(eq(paymentsMadeTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  const name = await getVendorName(r.vendorId);
  res.json({ ...r, vendorName: name, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() });
});

router.delete("/payments-made/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(paymentsMadeTable).where(eq(paymentsMadeTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(paymentsMadeTable).where(eq(paymentsMadeTable.id, id));
  res.sendStatus(204);
});

// ── VENDOR CREDITS ────────────────────────────────────────────────────────────
router.get("/vendor-credits", async (req, res): Promise<void> => {
  const { vendorId } = req.query;
  let rows = await db.select().from(vendorCreditsTable).orderBy(sql`created_at desc`);
  if (vendorId) rows = rows.filter((r) => r.vendorId === parseInt(String(vendorId), 10));
  const vendors = await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable);
  const nameMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
  res.json(rows.map((r) => ({ ...r, vendorName: nameMap[r.vendorId] ?? "Unknown", amount: parseFloat(String(r.amount)), balance: parseFloat(String(r.balance)), lineItems: (r.lineItems as unknown[]) ?? [], createdAt: r.createdAt.toISOString() })));
});

router.post("/vendor-credits", async (req, res): Promise<void> => {
  const { vendorId, date, notes, lineItems } = req.body;
  if (!vendorId || !date) { res.status(400).json({ error: "Missing required fields" }); return; }
  const items = lineItems ?? [];
  const amount = items.reduce((s: number, li: { amount?: number }) => s + (li.amount ?? 0), 0);
  const vendorCreditNumber = `VC-${Date.now()}`;
  const [inserted] = await db.insert(vendorCreditsTable).values({ vendorCreditNumber, vendorId, date, notes, lineItems: items, amount: String(amount), balance: String(amount) }).$returningId();
  const [r] = await db.select().from(vendorCreditsTable).where(eq(vendorCreditsTable.id, inserted.id));
  const name = await getVendorName(vendorId);
  res.status(201).json({ ...r, vendorName: name, amount: parseFloat(String(r.amount)), balance: parseFloat(String(r.balance)), lineItems: (r.lineItems as unknown[]) ?? [], createdAt: r.createdAt.toISOString() });
});

router.get("/vendor-credits/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(vendorCreditsTable).where(eq(vendorCreditsTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  const name = await getVendorName(r.vendorId);
  res.json({ ...r, vendorName: name, amount: parseFloat(String(r.amount)), balance: parseFloat(String(r.balance)), lineItems: (r.lineItems as unknown[]) ?? [], createdAt: r.createdAt.toISOString() });
});

router.patch("/vendor-credits/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["status","notes"]) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  await db.update(vendorCreditsTable).set(updates).where(eq(vendorCreditsTable.id, id));
  const [r] = await db.select().from(vendorCreditsTable).where(eq(vendorCreditsTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  const name = await getVendorName(r.vendorId);
  res.json({ ...r, vendorName: name, amount: parseFloat(String(r.amount)), balance: parseFloat(String(r.balance)), lineItems: (r.lineItems as unknown[]) ?? [], createdAt: r.createdAt.toISOString() });
});

router.delete("/vendor-credits/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(vendorCreditsTable).where(eq(vendorCreditsTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(vendorCreditsTable).where(eq(vendorCreditsTable.id, id));
  res.sendStatus(204);
});

export default router;
