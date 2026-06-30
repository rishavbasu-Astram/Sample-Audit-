import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, bankAccountsTable, bankTransactionsTable } from "@workspace/db";

const router: IRouter = Router();

function formatAccount(a: typeof bankAccountsTable.$inferSelect) {
  return { ...a, currentBalance: parseFloat(String(a.currentBalance)), createdAt: a.createdAt.toISOString() };
}

function formatTx(t: typeof bankTransactionsTable.$inferSelect) {
  return { ...t, amount: parseFloat(String(t.amount)), balance: parseFloat(String(t.balance)), createdAt: t.createdAt.toISOString() };
}

router.get("/bank-accounts", async (req, res): Promise<void> => {
  const rows = await db.select().from(bankAccountsTable).orderBy(sql`created_at desc`);
  res.json(rows.map(formatAccount));
});

router.post("/bank-accounts", async (req, res): Promise<void> => {
  const { name, accountNumber, bankName, accountType, currency, currentBalance } = req.body;
  if (!name || !accountType || !currency || currentBalance == null) { res.status(400).json({ error: "Missing required fields" }); return; }
  const [inserted] = await db.insert(bankAccountsTable).values({ name, accountNumber, bankName, accountType, currency, currentBalance: String(currentBalance) }).$returningId();
  const [a] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, inserted.id));
  res.status(201).json(formatAccount(a));
});

router.get("/bank-accounts/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [a] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, id));
  if (!a) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatAccount(a));
});

router.patch("/bank-accounts/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const updates: Record<string, unknown> = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
  if (req.body.currentBalance !== undefined) updates.currentBalance = String(req.body.currentBalance);
  await db.update(bankAccountsTable).set(updates).where(eq(bankAccountsTable.id, id));
  const [a] = await db.select().from(bankAccountsTable).where(eq(bankAccountsTable.id, id));
  if (!a) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatAccount(a));
});

router.get("/bank-transactions", async (req, res): Promise<void> => {
  const { accountId, type, from, to } = req.query;
  let rows = await db.select().from(bankTransactionsTable).orderBy(sql`date desc, created_at desc`);
  if (accountId) rows = rows.filter((t) => t.accountId === parseInt(String(accountId), 10));
  if (type) rows = rows.filter((t) => t.type === String(type));
  if (from) rows = rows.filter((t) => t.date >= String(from));
  if (to) rows = rows.filter((t) => t.date <= String(to));
  res.json(rows.map(formatTx));
});

router.post("/bank-transactions", async (req, res): Promise<void> => {
  const { accountId, date, type, amount, description, reference } = req.body;
  if (!accountId || !date || !type || amount == null || !description) { res.status(400).json({ error: "Missing required fields" }); return; }
  const [acct] = await db.select({ bal: bankAccountsTable.currentBalance }).from(bankAccountsTable).where(eq(bankAccountsTable.id, accountId));
  const prevBal = parseFloat(String(acct?.bal ?? "0"));
  const newBal = type === "credit" ? prevBal + parseFloat(String(amount)) : prevBal - parseFloat(String(amount));
  await db.update(bankAccountsTable).set({ currentBalance: String(newBal) }).where(eq(bankAccountsTable.id, accountId));
  const [inserted] = await db.insert(bankTransactionsTable).values({ accountId, date, type, amount: String(amount), description, reference, balance: String(newBal) }).$returningId();
  const [t] = await db.select().from(bankTransactionsTable).where(eq(bankTransactionsTable.id, inserted.id));
  res.status(201).json(formatTx(t));
});

export default router;
