import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  customersTable,
  quotesTable,
  salesOrdersTable,
  invoicesTable,
  salesReceiptsTable,
  recurringInvoicesTable,
  paymentLinksTable,
  paymentsReceivedTable,
  creditNotesTable,
} from "@workspace/db";

const router: IRouter = Router();

function numericFields(obj: Record<string, unknown>, fields: string[]) {
  const result = { ...obj };
  for (const f of fields) {
    if (result[f] !== undefined && result[f] !== null) {
      result[f] = parseFloat(String(result[f]));
    }
  }
  return result;
}

function formatCustomer(c: typeof customersTable.$inferSelect) {
  return { ...c, outstandingBalance: parseFloat(String(c.outstandingBalance)), createdAt: c.createdAt.toISOString() };
}

// ── CUSTOMERS ────────────────────────────────────────────────────────────────
router.get("/customers", async (req, res): Promise<void> => {
  const { search, status } = req.query;
  let rows = await db.select().from(customersTable).orderBy(sql`created_at desc`);
  if (status) rows = rows.filter((c) => c.status === String(status));
  if (search) {
    const s = String(search).toLowerCase();
    rows = rows.filter((c) => c.name.toLowerCase().includes(s) || (c.email ?? "").toLowerCase().includes(s));
  }
  res.json(rows.map(formatCustomer));
});

router.post("/customers", async (req, res): Promise<void> => {
  const { name, email, phone, company, address, taxNumber, currency, status } = req.body;
  if (!name) { res.status(400).json({ error: "Name is required" }); return; }
  const [inserted] = await db.insert(customersTable).values({ name, email, phone, company, address, taxNumber, currency: currency ?? "USD", status: status ?? "active" }).$returningId();
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, inserted.id));
  res.status(201).json(formatCustomer(c));
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!c) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json(formatCustomer(c));
});

router.patch("/customers/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["name","email","phone","company","address","taxNumber","currency","status"]) {
    if (req.body[f] !== undefined) updates[f === "taxNumber" ? "taxNumber" : f] = req.body[f];
  }
  await db.update(customersTable).set(updates).where(eq(customersTable.id, id));
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!c) { res.status(404).json({ error: "Customer not found" }); return; }
  res.json(formatCustomer(c));
});

router.delete("/customers/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!c) { res.status(404).json({ error: "Customer not found" }); return; }
  await db.delete(customersTable).where(eq(customersTable.id, id));
  res.sendStatus(204);
});

// ── HELPER to get customer name ───────────────────────────────────────────────
async function getCustomerName(id: number): Promise<string> {
  const [c] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, id));
  return c?.name ?? "Unknown";
}

// ── QUOTES ────────────────────────────────────────────────────────────────────
function formatQuote(q: typeof quotesTable.$inferSelect, customerName: string) {
  return {
    ...q,
    customerName,
    subtotal: parseFloat(String(q.subtotal)),
    taxAmount: parseFloat(String(q.taxAmount)),
    total: parseFloat(String(q.total)),
    lineItems: (q.lineItems as unknown[]) ?? [],
    createdAt: q.createdAt.toISOString(),
  };
}

router.get("/quotes", async (req, res): Promise<void> => {
  const { status, customerId } = req.query;
  let rows = await db.select().from(quotesTable).orderBy(sql`created_at desc`);
  if (status) rows = rows.filter((q) => q.status === String(status));
  if (customerId) rows = rows.filter((q) => q.customerId === parseInt(String(customerId), 10));
  const customers = await db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable);
  const nameMap = Object.fromEntries(customers.map((c) => [c.id, c.name]));
  res.json(rows.map((q) => formatQuote(q, nameMap[q.customerId] ?? "Unknown")));
});

router.post("/quotes", async (req, res): Promise<void> => {
  const { customerId, date, expiryDate, notes, lineItems } = req.body;
  if (!customerId || !date) { res.status(400).json({ error: "customerId and date are required" }); return; }
  const items = lineItems ?? [];
  const subtotal = items.reduce((s: number, li: { amount?: number }) => s + (li.amount ?? 0), 0);
  const taxAmount = items.reduce((s: number, li: { taxRate?: number; amount?: number }) => s + ((li.taxRate ?? 0) / 100) * (li.amount ?? 0), 0);
  const total = subtotal + taxAmount;
  const quoteNumber = `QT-${Date.now()}`;
  const [inserted] = await db.insert(quotesTable).values({ quoteNumber, customerId, date, expiryDate, notes, lineItems: items, subtotal: String(subtotal), taxAmount: String(taxAmount), total: String(total) }).$returningId();
  const [q] = await db.select().from(quotesTable).where(eq(quotesTable.id, inserted.id));
  const name = await getCustomerName(customerId);
  res.status(201).json(formatQuote(q, name));
});

router.get("/quotes/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [q] = await db.select().from(quotesTable).where(eq(quotesTable.id, id));
  if (!q) { res.status(404).json({ error: "Quote not found" }); return; }
  const name = await getCustomerName(q.customerId);
  res.json(formatQuote(q, name));
});

router.patch("/quotes/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["expiryDate","status","notes","lineItems"]) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  await db.update(quotesTable).set(updates).where(eq(quotesTable.id, id));
  const [q] = await db.select().from(quotesTable).where(eq(quotesTable.id, id));
  if (!q) { res.status(404).json({ error: "Quote not found" }); return; }
  const name = await getCustomerName(q.customerId);
  res.json(formatQuote(q, name));
});

router.delete("/quotes/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [q] = await db.select().from(quotesTable).where(eq(quotesTable.id, id));
  if (!q) { res.status(404).json({ error: "Quote not found" }); return; }
  await db.delete(quotesTable).where(eq(quotesTable.id, id));
  res.sendStatus(204);
});

router.post("/quotes/:id/convert-to-invoice", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [q] = await db.select().from(quotesTable).where(eq(quotesTable.id, id));
  if (!q) { res.status(404).json({ error: "Quote not found" }); return; }
  const today = new Date().toISOString().split("T")[0];
  const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
  const invoiceNumber = `INV-${Date.now()}`;
  const [inserted] = await db.insert(invoicesTable).values({
    invoiceNumber,
    customerId: q.customerId,
    date: today,
    dueDate,
    lineItems: q.lineItems as unknown[],
    subtotal: q.subtotal,
    taxAmount: q.taxAmount,
    total: q.total,
    amountDue: q.total,
    amountPaid: "0",
  }).$returningId();
  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, inserted.id));
  await db.update(quotesTable).set({ status: "approved" }).where(eq(quotesTable.id, id));
  const name = await getCustomerName(inv.customerId);
  res.status(201).json({
    ...inv,
    customerName: name,
    subtotal: parseFloat(String(inv.subtotal)),
    taxAmount: parseFloat(String(inv.taxAmount)),
    total: parseFloat(String(inv.total)),
    amountPaid: parseFloat(String(inv.amountPaid)),
    amountDue: parseFloat(String(inv.amountDue)),
    lineItems: (inv.lineItems as unknown[]) ?? [],
    createdAt: inv.createdAt.toISOString(),
  });
});

// ── SALES ORDERS ──────────────────────────────────────────────────────────────
function formatSalesOrder(o: typeof salesOrdersTable.$inferSelect, customerName: string) {
  return {
    ...o,
    customerName,
    subtotal: parseFloat(String(o.subtotal)),
    taxAmount: parseFloat(String(o.taxAmount)),
    total: parseFloat(String(o.total)),
    lineItems: (o.lineItems as unknown[]) ?? [],
    createdAt: o.createdAt.toISOString(),
  };
}

router.get("/sales-orders", async (req, res): Promise<void> => {
  const { status, customerId } = req.query;
  let rows = await db.select().from(salesOrdersTable).orderBy(sql`created_at desc`);
  if (status) rows = rows.filter((o) => o.status === String(status));
  if (customerId) rows = rows.filter((o) => o.customerId === parseInt(String(customerId), 10));
  const customers = await db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable);
  const nameMap = Object.fromEntries(customers.map((c) => [c.id, c.name]));
  res.json(rows.map((o) => formatSalesOrder(o, nameMap[o.customerId] ?? "Unknown")));
});

router.post("/sales-orders", async (req, res): Promise<void> => {
  const { customerId, date, deliveryDate, notes, lineItems } = req.body;
  if (!customerId || !date) { res.status(400).json({ error: "customerId and date are required" }); return; }
  const items = lineItems ?? [];
  const subtotal = items.reduce((s: number, li: { amount?: number }) => s + (li.amount ?? 0), 0);
  const taxAmount = items.reduce((s: number, li: { taxRate?: number; amount?: number }) => s + ((li.taxRate ?? 0) / 100) * (li.amount ?? 0), 0);
  const total = subtotal + taxAmount;
  const orderNumber = `SO-${Date.now()}`;
  const [inserted] = await db.insert(salesOrdersTable).values({ orderNumber, customerId, date, deliveryDate, notes, lineItems: items, subtotal: String(subtotal), taxAmount: String(taxAmount), total: String(total) }).$returningId();
  const [o] = await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.id, inserted.id));
  const name = await getCustomerName(customerId);
  res.status(201).json(formatSalesOrder(o, name));
});

router.get("/sales-orders/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [o] = await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.id, id));
  if (!o) { res.status(404).json({ error: "Sales order not found" }); return; }
  const name = await getCustomerName(o.customerId);
  res.json(formatSalesOrder(o, name));
});

router.patch("/sales-orders/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["deliveryDate","status","notes","lineItems"]) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  await db.update(salesOrdersTable).set(updates).where(eq(salesOrdersTable.id, id));
  const [o] = await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.id, id));
  if (!o) { res.status(404).json({ error: "Sales order not found" }); return; }
  const name = await getCustomerName(o.customerId);
  res.json(formatSalesOrder(o, name));
});

router.delete("/sales-orders/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [o] = await db.select().from(salesOrdersTable).where(eq(salesOrdersTable.id, id));
  if (!o) { res.status(404).json({ error: "Sales order not found" }); return; }
  await db.delete(salesOrdersTable).where(eq(salesOrdersTable.id, id));
  res.sendStatus(204);
});

// ── INVOICES ──────────────────────────────────────────────────────────────────
function formatInvoice(inv: typeof invoicesTable.$inferSelect, customerName: string) {
  return {
    ...inv,
    customerName,
    subtotal: parseFloat(String(inv.subtotal)),
    taxAmount: parseFloat(String(inv.taxAmount)),
    total: parseFloat(String(inv.total)),
    amountPaid: parseFloat(String(inv.amountPaid)),
    amountDue: parseFloat(String(inv.amountDue)),
    lineItems: (inv.lineItems as unknown[]) ?? [],
    createdAt: inv.createdAt.toISOString(),
  };
}

router.get("/invoices", async (req, res): Promise<void> => {
  const { status, customerId, overdue } = req.query;
  let rows = await db.select().from(invoicesTable).orderBy(sql`created_at desc`);
  const today = new Date().toISOString().split("T")[0];
  if (status) rows = rows.filter((i) => i.status === String(status));
  if (customerId) rows = rows.filter((i) => i.customerId === parseInt(String(customerId), 10));
  if (overdue === "true") rows = rows.filter((i) => i.dueDate < today && !["paid","cancelled"].includes(i.status));
  const customers = await db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable);
  const nameMap = Object.fromEntries(customers.map((c) => [c.id, c.name]));
  res.json(rows.map((i) => formatInvoice(i, nameMap[i.customerId] ?? "Unknown")));
});

router.post("/invoices", async (req, res): Promise<void> => {
  const { customerId, date, dueDate, notes, lineItems } = req.body;
  if (!customerId || !date || !dueDate) { res.status(400).json({ error: "customerId, date, and dueDate are required" }); return; }
  const items = lineItems ?? [];
  const subtotal = items.reduce((s: number, li: { amount?: number }) => s + (li.amount ?? 0), 0);
  const taxAmount = items.reduce((s: number, li: { taxRate?: number; amount?: number }) => s + ((li.taxRate ?? 0) / 100) * (li.amount ?? 0), 0);
  const total = subtotal + taxAmount;
  const invoiceNumber = `INV-${Date.now()}`;
  const [inserted] = await db.insert(invoicesTable).values({ invoiceNumber, customerId, date, dueDate, notes, lineItems: items, subtotal: String(subtotal), taxAmount: String(taxAmount), total: String(total), amountDue: String(total), amountPaid: "0" }).$returningId();
  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, inserted.id));
  const name = await getCustomerName(customerId);
  res.status(201).json(formatInvoice(inv, name));
});

router.get("/invoices/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }
  const name = await getCustomerName(inv.customerId);
  res.json(formatInvoice(inv, name));
});

router.patch("/invoices/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["dueDate","status","notes","lineItems"]) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  await db.update(invoicesTable).set(updates).where(eq(invoicesTable.id, id));
  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }
  const name = await getCustomerName(inv.customerId);
  res.json(formatInvoice(inv, name));
});

router.delete("/invoices/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }
  await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
  res.sendStatus(204);
});

router.post("/invoices/:id/mark-sent", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (inv.status !== "draft") { res.status(409).json({ error: `Cannot mark as sent: invoice is already '${inv.status}'` }); return; }
  await db.update(invoicesTable).set({ status: "sent" }).where(eq(invoicesTable.id, id));
  const [updated] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  const name = await getCustomerName(updated.customerId);
  res.json(formatInvoice(updated, name));
});

router.post("/invoices/:id/record-payment", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (!["sent", "partially_paid"].includes(inv.status)) {
    res.status(409).json({ error: `Cannot record payment: invoice status is '${inv.status}'` }); return;
  }
  const { amount, date, paymentMethod, reference } = req.body;
  if (typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }
  const currentDue = parseFloat(String(inv.amountDue));
  if (amount > currentDue + 0.005) {
    res.status(400).json({ error: `Payment amount ${amount} exceeds amount due ${currentDue}` }); return;
  }
  const currentPaid = parseFloat(String(inv.amountPaid));
  const newPaid = currentPaid + amount;
  const newDue = currentDue - amount;
  const isPaid = newDue <= 0.005;
  const newStatus = isPaid ? "paid" : "partially_paid";
  const newAmountDue = isPaid ? "0" : String(newDue);
  const today = new Date().toISOString().split("T")[0];
  const payDate = date ?? today;
  await db.update(invoicesTable).set({
    amountPaid: String(newPaid),
    amountDue: newAmountDue,
    status: newStatus,
  }).where(eq(invoicesTable.id, id));
  await db.insert(paymentsReceivedTable).values({
    customerId: inv.customerId,
    date: payDate,
    amount: String(amount),
    paymentMethod: paymentMethod ?? "bank_transfer",
    reference: reference ?? null,
    invoiceId: id,
  }).$returningId();
  const [updated] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  const name = await getCustomerName(updated.customerId);
  res.json(formatInvoice(updated, name));
});

router.post("/invoices/:id/void", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (inv.status === "paid") { res.status(409).json({ error: "Cannot void a paid invoice" }); return; }
  if (inv.status === "cancelled") { res.status(409).json({ error: "Invoice is already cancelled" }); return; }
  await db.update(invoicesTable).set({ status: "cancelled", amountDue: "0" }).where(eq(invoicesTable.id, id));
  const [updated] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  const name = await getCustomerName(updated.customerId);
  res.json(formatInvoice(updated, name));
});

// ── SALES RECEIPTS ────────────────────────────────────────────────────────────
router.get("/sales-receipts", async (req, res): Promise<void> => {
  const { customerId } = req.query;
  let rows = await db.select().from(salesReceiptsTable).orderBy(sql`created_at desc`);
  if (customerId) rows = rows.filter((r) => r.customerId === parseInt(String(customerId), 10));
  const customers = await db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable);
  const nameMap = Object.fromEntries(customers.map((c) => [c.id, c.name]));
  res.json(rows.map((r) => ({ ...r, customerName: nameMap[r.customerId] ?? "Unknown", amount: parseFloat(String(r.amount)), lineItems: (r.lineItems as unknown[]) ?? [], createdAt: r.createdAt.toISOString() })));
});

router.post("/sales-receipts", async (req, res): Promise<void> => {
  const { customerId, date, paymentMethod, notes, lineItems } = req.body;
  if (!customerId || !date || !paymentMethod) { res.status(400).json({ error: "Missing required fields" }); return; }
  const items = lineItems ?? [];
  const amount = items.reduce((s: number, li: { amount?: number }) => s + (li.amount ?? 0), 0);
  const receiptNumber = `SR-${Date.now()}`;
  const [inserted] = await db.insert(salesReceiptsTable).values({ receiptNumber, customerId, date, paymentMethod, notes, lineItems: items, amount: String(amount) }).$returningId();
  const [r] = await db.select().from(salesReceiptsTable).where(eq(salesReceiptsTable.id, inserted.id));
  const name = await getCustomerName(customerId);
  res.status(201).json({ ...r, customerName: name, amount: parseFloat(String(r.amount)), lineItems: (r.lineItems as unknown[]) ?? [], createdAt: r.createdAt.toISOString() });
});

router.get("/sales-receipts/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(salesReceiptsTable).where(eq(salesReceiptsTable.id, id));
  if (!r) { res.status(404).json({ error: "Sales receipt not found" }); return; }
  const name = await getCustomerName(r.customerId);
  res.json({ ...r, customerName: name, amount: parseFloat(String(r.amount)), lineItems: (r.lineItems as unknown[]) ?? [], createdAt: r.createdAt.toISOString() });
});

router.patch("/sales-receipts/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["paymentMethod","notes"]) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  await db.update(salesReceiptsTable).set(updates).where(eq(salesReceiptsTable.id, id));
  const [r] = await db.select().from(salesReceiptsTable).where(eq(salesReceiptsTable.id, id));
  if (!r) { res.status(404).json({ error: "Sales receipt not found" }); return; }
  const name = await getCustomerName(r.customerId);
  res.json({ ...r, customerName: name, amount: parseFloat(String(r.amount)), lineItems: (r.lineItems as unknown[]) ?? [], createdAt: r.createdAt.toISOString() });
});

router.delete("/sales-receipts/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(salesReceiptsTable).where(eq(salesReceiptsTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(salesReceiptsTable).where(eq(salesReceiptsTable.id, id));
  res.sendStatus(204);
});

// ── RECURRING INVOICES ────────────────────────────────────────────────────────
router.get("/recurring-invoices", async (req, res): Promise<void> => {
  const rows = await db.select().from(recurringInvoicesTable).orderBy(sql`created_at desc`);
  const customers = await db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable);
  const nameMap = Object.fromEntries(customers.map((c) => [c.id, c.name]));
  res.json(rows.map((r) => ({ ...r, customerName: nameMap[r.customerId] ?? "Unknown", amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() })));
});

router.post("/recurring-invoices", async (req, res): Promise<void> => {
  const { customerId, frequency, nextDate, amount, notes } = req.body;
  if (!customerId || !frequency || !nextDate || amount == null) { res.status(400).json({ error: "Missing required fields" }); return; }
  const [inserted] = await db.insert(recurringInvoicesTable).values({ customerId, frequency, nextDate, amount: String(amount), notes }).$returningId();
  const [r] = await db.select().from(recurringInvoicesTable).where(eq(recurringInvoicesTable.id, inserted.id));
  const name = await getCustomerName(customerId);
  res.status(201).json({ ...r, customerName: name, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() });
});

router.get("/recurring-invoices/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(recurringInvoicesTable).where(eq(recurringInvoicesTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  const name = await getCustomerName(r.customerId);
  res.json({ ...r, customerName: name, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() });
});

router.patch("/recurring-invoices/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["frequency","nextDate","status","notes"]) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  if (req.body.amount !== undefined) updates.amount = String(req.body.amount);
  await db.update(recurringInvoicesTable).set(updates).where(eq(recurringInvoicesTable.id, id));
  const [r] = await db.select().from(recurringInvoicesTable).where(eq(recurringInvoicesTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  const name = await getCustomerName(r.customerId);
  res.json({ ...r, customerName: name, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() });
});

router.delete("/recurring-invoices/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(recurringInvoicesTable).where(eq(recurringInvoicesTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(recurringInvoicesTable).where(eq(recurringInvoicesTable.id, id));
  res.sendStatus(204);
});

// ── PAYMENT LINKS ─────────────────────────────────────────────────────────────
router.get("/payment-links", async (req, res): Promise<void> => {
  const rows = await db.select().from(paymentLinksTable).orderBy(sql`created_at desc`);
  res.json(rows.map((r) => ({ ...r, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() })));
});

router.post("/payment-links", async (req, res): Promise<void> => {
  const { title, amount, currency, expiresAt } = req.body;
  if (!title || amount == null || !currency) { res.status(400).json({ error: "Missing required fields" }); return; }
  const url = `https://pay.example.com/${Date.now()}`;
  const [inserted] = await db.insert(paymentLinksTable).values({ title, amount: String(amount), currency, url, expiresAt }).$returningId();
  const [r] = await db.select().from(paymentLinksTable).where(eq(paymentLinksTable.id, inserted.id));
  res.status(201).json({ ...r, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() });
});

router.get("/payment-links/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(paymentLinksTable).where(eq(paymentLinksTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...r, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() });
});

router.delete("/payment-links/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(paymentLinksTable).where(eq(paymentLinksTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(paymentLinksTable).where(eq(paymentLinksTable.id, id));
  res.sendStatus(204);
});

// ── PAYMENTS RECEIVED ─────────────────────────────────────────────────────────
router.get("/payments-received", async (req, res): Promise<void> => {
  const { customerId } = req.query;
  let rows = await db.select().from(paymentsReceivedTable).orderBy(sql`created_at desc`);
  if (customerId) rows = rows.filter((r) => r.customerId === parseInt(String(customerId), 10));
  const customers = await db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable);
  const nameMap = Object.fromEntries(customers.map((c) => [c.id, c.name]));
  res.json(rows.map((r) => ({ ...r, customerName: nameMap[r.customerId] ?? "Unknown", amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() })));
});

router.post("/payments-received", async (req, res): Promise<void> => {
  const { customerId, date, amount, paymentMethod, reference, invoiceId, notes } = req.body;
  if (!customerId || !date || amount == null || !paymentMethod) { res.status(400).json({ error: "Missing required fields" }); return; }
  const [inserted] = await db.insert(paymentsReceivedTable).values({ customerId, date, amount: String(amount), paymentMethod, reference, invoiceId, notes }).$returningId();
  const [r] = await db.select().from(paymentsReceivedTable).where(eq(paymentsReceivedTable.id, inserted.id));
  const name = await getCustomerName(customerId);
  res.status(201).json({ ...r, customerName: name, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() });
});

router.get("/payments-received/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(paymentsReceivedTable).where(eq(paymentsReceivedTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  const name = await getCustomerName(r.customerId);
  res.json({ ...r, customerName: name, amount: parseFloat(String(r.amount)), createdAt: r.createdAt.toISOString() });
});

router.delete("/payments-received/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(paymentsReceivedTable).where(eq(paymentsReceivedTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(paymentsReceivedTable).where(eq(paymentsReceivedTable.id, id));
  res.sendStatus(204);
});

// ── CREDIT NOTES ──────────────────────────────────────────────────────────────
router.get("/credit-notes", async (req, res): Promise<void> => {
  const { customerId } = req.query;
  let rows = await db.select().from(creditNotesTable).orderBy(sql`created_at desc`);
  if (customerId) rows = rows.filter((r) => r.customerId === parseInt(String(customerId), 10));
  const customers = await db.select({ id: customersTable.id, name: customersTable.name }).from(customersTable);
  const nameMap = Object.fromEntries(customers.map((c) => [c.id, c.name]));
  res.json(rows.map((r) => ({ ...r, customerName: nameMap[r.customerId] ?? "Unknown", amount: parseFloat(String(r.amount)), balance: parseFloat(String(r.balance)), lineItems: (r.lineItems as unknown[]) ?? [], createdAt: r.createdAt.toISOString() })));
});

router.post("/credit-notes", async (req, res): Promise<void> => {
  const { customerId, date, notes, lineItems } = req.body;
  if (!customerId || !date) { res.status(400).json({ error: "Missing required fields" }); return; }
  const items = lineItems ?? [];
  const amount = items.reduce((s: number, li: { amount?: number }) => s + (li.amount ?? 0), 0);
  const creditNoteNumber = `CN-${Date.now()}`;
  const [inserted] = await db.insert(creditNotesTable).values({ creditNoteNumber, customerId, date, notes, lineItems: items, amount: String(amount), balance: String(amount) }).$returningId();
  const [r] = await db.select().from(creditNotesTable).where(eq(creditNotesTable.id, inserted.id));
  const name = await getCustomerName(customerId);
  res.status(201).json({ ...r, customerName: name, amount: parseFloat(String(r.amount)), balance: parseFloat(String(r.balance)), lineItems: (r.lineItems as unknown[]) ?? [], createdAt: r.createdAt.toISOString() });
});

router.get("/credit-notes/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(creditNotesTable).where(eq(creditNotesTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  const name = await getCustomerName(r.customerId);
  res.json({ ...r, customerName: name, amount: parseFloat(String(r.amount)), balance: parseFloat(String(r.balance)), lineItems: (r.lineItems as unknown[]) ?? [], createdAt: r.createdAt.toISOString() });
});

router.patch("/credit-notes/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  for (const f of ["status","notes"]) { if (req.body[f] !== undefined) updates[f] = req.body[f]; }
  await db.update(creditNotesTable).set(updates).where(eq(creditNotesTable.id, id));
  const [r] = await db.select().from(creditNotesTable).where(eq(creditNotesTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  const name = await getCustomerName(r.customerId);
  res.json({ ...r, customerName: name, amount: parseFloat(String(r.amount)), balance: parseFloat(String(r.balance)), lineItems: (r.lineItems as unknown[]) ?? [], createdAt: r.createdAt.toISOString() });
});

router.delete("/credit-notes/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [r] = await db.select().from(creditNotesTable).where(eq(creditNotesTable.id, id));
  if (!r) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(creditNotesTable).where(eq(creditNotesTable.id, id));
  res.sendStatus(204);
});

export default router;
