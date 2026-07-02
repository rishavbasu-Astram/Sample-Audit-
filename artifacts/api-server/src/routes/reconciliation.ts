import { Router, type IRouter } from "express";
import { eq, desc, asc, and, isNotNull } from "drizzle-orm";
import {
  db,
  statementLinesTable,
  bankAccountsTable,
  bankTransactionsTable,
} from "@workspace/db";
import type { StatementLineRow } from "@workspace/db";

const router: IRouter = Router();

// ── Serializer ───────────────────────────────────────────────────────────────

async function serializeLines(lines: StatementLineRow[]) {
  const accountIds = [...new Set(lines.map((l) => l.accountId))];
  const txnIds = lines
    .map((l) => l.matchedTransactionId)
    .filter((id): id is number => id != null);

  const accounts =
    accountIds.length > 0
      ? await db
          .select({ id: bankAccountsTable.id, name: bankAccountsTable.name })
          .from(bankAccountsTable)
      : [];
  const txns =
    txnIds.length > 0
      ? await db
          .select({ id: bankTransactionsTable.id, description: bankTransactionsTable.description })
          .from(bankTransactionsTable)
      : [];

  const accountNameMap = new Map(accounts.map((a) => [a.id, a.name]));
  const txnDescMap = new Map(txns.map((t) => [t.id, t.description]));

  return lines.map((l) => ({
    id: l.id,
    accountId: l.accountId,
    accountName: accountNameMap.get(l.accountId) ?? null,
    date: l.date,
    description: l.description,
    amount: parseFloat(String(l.amount)),
    type: l.type,
    reference: l.reference ?? null,
    status: l.status,
    matchedTransactionId: l.matchedTransactionId ?? null,
    matchedTransactionDescription:
      l.matchedTransactionId != null
        ? (txnDescMap.get(l.matchedTransactionId) ?? null)
        : null,
    createdAt: l.createdAt.toISOString(),
  }));
}

async function serializeLine(line: StatementLineRow) {
  const [serialized] = await serializeLines([line]);
  return serialized;
}

// ── GET /statement-lines ─────────────────────────────────────────────────────

router.get("/statement-lines", async (req, res): Promise<void> => {
  const { accountId, status } = req.query;
  let rows = await db
    .select()
    .from(statementLinesTable)
    .orderBy(desc(statementLinesTable.date), desc(statementLinesTable.id));

  if (accountId) {
    const aid = parseInt(String(accountId), 10);
    rows = rows.filter((r) => r.accountId === aid);
  }
  if (status) {
    rows = rows.filter((r) => r.status === String(status));
  }

  res.json(await serializeLines(rows));
});

// ── POST /statement-imports ──────────────────────────────────────────────────

router.post("/statement-imports", async (req, res): Promise<void> => {
  const { accountId, lines } = req.body;

  // Validate account exists
  const parsedAccountId = parseInt(String(accountId), 10);
  if (!parsedAccountId || isNaN(parsedAccountId)) {
    res.status(400).json({ error: "accountId is required" });
    return;
  }
  const [account] = await db
    .select({ id: bankAccountsTable.id })
    .from(bankAccountsTable)
    .where(eq(bankAccountsTable.id, parsedAccountId));
  if (!account) {
    res.status(400).json({ error: `No bank account found with id ${parsedAccountId}` });
    return;
  }

  // Validate lines non-empty array
  if (!Array.isArray(lines) || lines.length === 0) {
    res.status(400).json({ error: "lines must be a non-empty array" });
    return;
  }

  // Validate each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.date || typeof line.date !== "string") {
      res.status(400).json({ error: `Line ${i}: date is required` });
      return;
    }
    if (!line.description || typeof line.description !== "string") {
      res.status(400).json({ error: `Line ${i}: description is required` });
      return;
    }
    if (!line.type || typeof line.type !== "string") {
      res.status(400).json({ error: `Line ${i}: type is required` });
      return;
    }
    if (!["debit", "credit"].includes(line.type)) {
      res.status(400).json({ error: `Line ${i}: type must be 'debit' or 'credit'` });
      return;
    }
    const amt = parseFloat(String(line.amount));
    if (isNaN(amt) || amt <= 0) {
      res.status(400).json({ error: `Line ${i}: amount must be a positive number` });
      return;
    }
  }

  // Insert all
  const values = lines.map((line: { date: string; description: string; amount: number; type: string; reference?: string }) => ({
    accountId: parsedAccountId,
    date: String(line.date),
    description: String(line.description),
    amount: String(parseFloat(String(line.amount))),
    type: String(line.type),
    reference: line.reference ? String(line.reference) : null,
    status: "unmatched" as const,
  }));

  await db.insert(statementLinesTable).values(values);

  res.status(201).json({ imported: values.length });
});

// ── POST /statement-lines/:id/match ─────────────────────────────────────────

router.post("/statement-lines/:id/match", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { transactionId } = req.body;

  const [line] = await db
    .select()
    .from(statementLinesTable)
    .where(eq(statementLinesTable.id, id));
  if (!line) {
    res.status(404).json({ error: "Statement line not found" });
    return;
  }
  if (line.status !== "unmatched") {
    res.status(409).json({ error: `Line is already ${line.status}` });
    return;
  }

  const parsedTxnId = parseInt(String(transactionId), 10);
  if (!parsedTxnId || isNaN(parsedTxnId)) {
    res.status(400).json({ error: "transactionId is required" });
    return;
  }

  const [txn] = await db
    .select()
    .from(bankTransactionsTable)
    .where(eq(bankTransactionsTable.id, parsedTxnId));
  if (!txn) {
    res.status(400).json({ error: `No bank transaction found with id ${parsedTxnId}` });
    return;
  }
  if (txn.accountId !== line.accountId) {
    res.status(400).json({ error: "Transaction belongs to a different account" });
    return;
  }

  // Check txn not already matched by another line
  const [alreadyMatched] = await db
    .select({ id: statementLinesTable.id })
    .from(statementLinesTable)
    .where(eq(statementLinesTable.matchedTransactionId, parsedTxnId));
  if (alreadyMatched) {
    res.status(400).json({ error: "Transaction is already matched to another statement line" });
    return;
  }

  await db
    .update(statementLinesTable)
    .set({ status: "matched", matchedTransactionId: parsedTxnId })
    .where(eq(statementLinesTable.id, id));

  const [updated] = await db
    .select()
    .from(statementLinesTable)
    .where(eq(statementLinesTable.id, id));
  res.json(await serializeLine(updated));
});

// ── POST /statement-lines/:id/unmatch ────────────────────────────────────────

router.post("/statement-lines/:id/unmatch", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [line] = await db
    .select()
    .from(statementLinesTable)
    .where(eq(statementLinesTable.id, id));
  if (!line) {
    res.status(404).json({ error: "Statement line not found" });
    return;
  }
  if (line.status === "reconciled") {
    res.status(400).json({ error: "already reconciled — cannot unmatch" });
    return;
  }

  await db
    .update(statementLinesTable)
    .set({ status: "unmatched", matchedTransactionId: null })
    .where(eq(statementLinesTable.id, id));

  const [updated] = await db
    .select()
    .from(statementLinesTable)
    .where(eq(statementLinesTable.id, id));
  res.json(await serializeLine(updated));
});

// ── DELETE /statement-lines/:id ──────────────────────────────────────────────

router.delete("/statement-lines/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [line] = await db
    .select()
    .from(statementLinesTable)
    .where(eq(statementLinesTable.id, id));
  if (!line) {
    res.status(404).json({ error: "Statement line not found" });
    return;
  }
  if (line.status === "reconciled") {
    res.status(400).json({ error: "Cannot delete a reconciled statement line" });
    return;
  }

  await db.delete(statementLinesTable).where(eq(statementLinesTable.id, id));
  res.sendStatus(204);
});

// ── POST /bank-accounts/:id/auto-match ───────────────────────────────────────

function parseDate(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

function dateDiffDays(a: string, b: string): number {
  return Math.abs(
    (parseDate(a).getTime() - parseDate(b).getTime()) / 86400000
  );
}

router.post("/bank-accounts/:id/auto-match", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [account] = await db
    .select({ id: bankAccountsTable.id })
    .from(bankAccountsTable)
    .where(eq(bankAccountsTable.id, id));
  if (!account) {
    res.status(404).json({ error: "Bank account not found" });
    return;
  }

  // Load this account's unmatched lines ordered by id asc
  const unmatchedLines = await db
    .select()
    .from(statementLinesTable)
    .where(
      and(
        eq(statementLinesTable.accountId, id),
        eq(statementLinesTable.status, "unmatched")
      )
    )
    .orderBy(asc(statementLinesTable.id));

  // Load all transactions for this account
  const allTxns = await db
    .select()
    .from(bankTransactionsTable)
    .where(eq(bankTransactionsTable.accountId, id));

  // Build used set: all txn IDs already matched/reconciled by ANY statement line
  const alreadyMatchedLines = await db
    .select({ matchedTransactionId: statementLinesTable.matchedTransactionId })
    .from(statementLinesTable)
    .where(isNotNull(statementLinesTable.matchedTransactionId));

  const used = new Set<number>(
    alreadyMatchedLines
      .map((l) => l.matchedTransactionId)
      .filter((id): id is number => id != null)
  );

  let matched = 0;

  for (const line of unmatchedLines) {
    const lineAmount = parseFloat(String(line.amount));

    // Find candidates: same type, amount within 0.005, date within 3 days, not used
    const candidates = allTxns.filter((txn) => {
      if (used.has(txn.id)) return false;
      if (txn.type !== line.type) return false;
      const txnAmount = parseFloat(String(txn.amount));
      if (Math.abs(txnAmount - lineAmount) >= 0.005) return false;
      if (dateDiffDays(txn.date, line.date) > 3) return false;
      return true;
    });

    if (candidates.length === 0) continue;

    // Pick: smallest |dateDiff| then lowest txn id
    candidates.sort((a, b) => {
      const diffA = dateDiffDays(a.date, line.date);
      const diffB = dateDiffDays(b.date, line.date);
      if (diffA !== diffB) return diffA - diffB;
      return a.id - b.id;
    });

    const best = candidates[0];
    await db
      .update(statementLinesTable)
      .set({ status: "matched", matchedTransactionId: best.id })
      .where(eq(statementLinesTable.id, line.id));

    used.add(best.id);
    matched++;
  }

  res.json({ matched });
});

// ── POST /bank-accounts/:id/reconcile ────────────────────────────────────────

router.post("/bank-accounts/:id/reconcile", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [account] = await db
    .select({ id: bankAccountsTable.id })
    .from(bankAccountsTable)
    .where(eq(bankAccountsTable.id, id));
  if (!account) {
    res.status(404).json({ error: "Bank account not found" });
    return;
  }

  // Count matched lines before updating
  const matchedLines = await db
    .select()
    .from(statementLinesTable)
    .where(
      and(
        eq(statementLinesTable.accountId, id),
        eq(statementLinesTable.status, "matched")
      )
    );

  const count = matchedLines.length;

  if (count > 0) {
    await db
      .update(statementLinesTable)
      .set({ status: "reconciled" })
      .where(
        and(
          eq(statementLinesTable.accountId, id),
          eq(statementLinesTable.status, "matched")
        )
      );
  }

  res.json({ reconciled: count });
});

// ── GET /bank-accounts/:id/reconciliation ────────────────────────────────────

router.get("/bank-accounts/:id/reconciliation", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [account] = await db
    .select({ id: bankAccountsTable.id, name: bankAccountsTable.name, currentBalance: bankAccountsTable.currentBalance })
    .from(bankAccountsTable)
    .where(eq(bankAccountsTable.id, id));
  if (!account) {
    res.status(404).json({ error: "Bank account not found" });
    return;
  }

  const lines = await db
    .select()
    .from(statementLinesTable)
    .where(eq(statementLinesTable.accountId, id));

  let unmatchedCount = 0;
  let matchedCount = 0;
  let reconciledCount = 0;
  let unmatchedCreditSum = 0;
  let unmatchedDebitSum = 0;

  for (const line of lines) {
    const amt = parseFloat(String(line.amount));
    if (line.status === "unmatched") {
      unmatchedCount++;
      if (line.type === "credit") unmatchedCreditSum += amt;
      else unmatchedDebitSum += amt;
    } else if (line.status === "matched") {
      matchedCount++;
    } else if (line.status === "reconciled") {
      reconciledCount++;
    }
  }

  const unmatchedNet = Math.round((unmatchedCreditSum - unmatchedDebitSum) * 100) / 100;

  res.json({
    accountId: account.id,
    accountName: account.name,
    ledgerBalance: parseFloat(String(account.currentBalance)),
    unmatched: unmatchedCount,
    matched: matchedCount,
    reconciled: reconciledCount,
    unmatchedNet,
  });
});

export default router;
