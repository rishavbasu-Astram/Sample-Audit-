import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, bankAccountsTable, bankTransactionsTable, bankTransfersTable } from "@workspace/db";

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

router.get("/bank-transfers", async (req, res): Promise<void> => {
  const transfers = await db.select().from(bankTransfersTable).orderBy(sql`created_at desc`);
  const accounts = await db.select({ id: bankAccountsTable.id, name: bankAccountsTable.name }).from(bankAccountsTable);
  const nameMap = new Map(accounts.map((a) => [a.id, a.name]));
  res.json(
    transfers.map((t) => ({
      ...t,
      amount: parseFloat(String(t.amount)),
      fromAccountName: nameMap.get(t.fromAccountId) ?? null,
      toAccountName: nameMap.get(t.toAccountId) ?? null,
      createdAt: t.createdAt.toISOString(),
    }))
  );
});

router.post("/bank-transfers", async (req, res): Promise<void> => {
  const { fromAccountId, toAccountId, amount, date, description, reference } = req.body;

  // Required field validation
  if (fromAccountId == null || toAccountId == null || amount == null) {
    res.status(400).json({ error: "fromAccountId, toAccountId, and amount are required" }); return;
  }
  if (fromAccountId === toAccountId) {
    res.status(400).json({ error: "fromAccountId and toAccountId must be different accounts" }); return;
  }
  const parsedAmount = parseFloat(String(amount));
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" }); return;
  }

  // Fetch both accounts in one query
  const accounts = await db.select({ id: bankAccountsTable.id, name: bankAccountsTable.name, balance: bankAccountsTable.currentBalance })
    .from(bankAccountsTable)
    .where(sql`${bankAccountsTable.id} IN (${fromAccountId}, ${toAccountId})`);
  const fromAcct = accounts.find((a) => a.id === fromAccountId);
  const toAcct = accounts.find((a) => a.id === toAccountId);
  if (!fromAcct) { res.status(400).json({ error: `No bank account found with id ${fromAccountId}` }); return; }
  if (!toAcct) { res.status(400).json({ error: `No bank account found with id ${toAccountId}` }); return; }

  const transferDate = date ?? new Date().toISOString().slice(0, 10);
  const prevFrom = parseFloat(String(fromAcct.balance));
  const prevTo = parseFloat(String(toAcct.balance));
  const newFromBal = prevFrom - parsedAmount;
  const newToBal = prevTo + parsedAmount;

  // Insert transfer row
  const [inserted] = await db.insert(bankTransfersTable).values({
    fromAccountId,
    toAccountId,
    date: transferDate,
    amount: String(parsedAmount),
    description: description ?? null,
    reference: reference ?? null,
  }).$returningId();
  const transferId = inserted.id;
  const trf = reference ?? `TRF-${transferId}`;

  // Insert debit tx on from-account
  await db.insert(bankTransactionsTable).values({
    accountId: fromAccountId,
    date: transferDate,
    type: "debit",
    amount: String(parsedAmount),
    description: `Transfer to ${toAcct.name}`,
    reference: trf,
    balance: String(newFromBal),
  });

  // Insert credit tx on to-account
  await db.insert(bankTransactionsTable).values({
    accountId: toAccountId,
    date: transferDate,
    type: "credit",
    amount: String(parsedAmount),
    description: `Transfer from ${fromAcct.name}`,
    reference: trf,
    balance: String(newToBal),
  });

  // Update balances on both accounts
  await db.update(bankAccountsTable).set({ currentBalance: String(newFromBal) }).where(eq(bankAccountsTable.id, fromAccountId));
  await db.update(bankAccountsTable).set({ currentBalance: String(newToBal) }).where(eq(bankAccountsTable.id, toAccountId));

  // Fetch and return the created transfer
  const [tf] = await db.select().from(bankTransfersTable).where(eq(bankTransfersTable.id, transferId));
  res.status(201).json({
    ...tf,
    amount: parseFloat(String(tf.amount)),
    fromAccountName: fromAcct.name,
    toAccountName: toAcct.name,
    createdAt: tf.createdAt.toISOString(),
  });
});

export default router;
