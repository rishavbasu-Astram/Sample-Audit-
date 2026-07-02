import { Router, type IRouter } from "express";
import {
  db,
  invoicesTable,
  billsTable,
  expensesTable,
  customersTable,
  chartOfAccountsTable,
} from "@workspace/db";
import { sql, and, gte, lte, notInArray, inArray, eq } from "drizzle-orm";

const router: IRouter = Router();

// ── PROFIT & LOSS ──────────────────────────────────────────────────────────
router.get("/reports/profit-and-loss", async (req, res): Promise<void> => {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const defaultFrom = `${now.getFullYear()}-01-01`;

  const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate : defaultFrom;
  const toDate = typeof req.query.toDate === "string" ? req.query.toDate : today;

  // Revenue: sum of invoice subtotals (accrual, ex-tax), excluding draft/cancelled
  const [revRow] = await db
    .select({ total: sql<string>`coalesce(sum(subtotal), 0)` })
    .from(invoicesTable)
    .where(
      and(
        gte(invoicesTable.date, fromDate),
        lte(invoicesTable.date, toDate),
        notInArray(invoicesTable.status, ["draft", "cancelled"]),
      ),
    );

  const revenue = parseFloat(revRow?.total ?? "0");

  // Revenue by customer
  const invoicesByCustomer = await db
    .select({
      customerId: invoicesTable.customerId,
      amount: sql<string>`coalesce(sum(subtotal), 0)`,
    })
    .from(invoicesTable)
    .where(
      and(
        gte(invoicesTable.date, fromDate),
        lte(invoicesTable.date, toDate),
        notInArray(invoicesTable.status, ["draft", "cancelled"]),
      ),
    )
    .groupBy(invoicesTable.customerId);

  // Fetch customer names for the customer IDs that appear
  const customerIds = invoicesByCustomer.map((r) => r.customerId);
  const customers =
    customerIds.length > 0
      ? await db
          .select({ id: customersTable.id, name: customersTable.name })
          .from(customersTable)
          .where(inArray(customersTable.id, customerIds))
      : [];

  const customerNameMap = new Map(customers.map((c) => [c.id, c.name]));

  const revenueByCustomer = invoicesByCustomer
    .map((r) => ({
      customerId: r.customerId,
      customerName: customerNameMap.get(r.customerId) ?? `Customer ${r.customerId}`,
      amount: parseFloat(r.amount),
    }))
    .sort((a, b) => b.amount - a.amount);

  // Bill costs: sum of bill subtotals, excluding cancelled
  const [billRow] = await db
    .select({ total: sql<string>`coalesce(sum(subtotal), 0)` })
    .from(billsTable)
    .where(
      and(
        gte(billsTable.date, fromDate),
        lte(billsTable.date, toDate),
        notInArray(billsTable.status, ["cancelled"]),
      ),
    );

  const billCosts = parseFloat(billRow?.total ?? "0");

  // Expense costs: sum of expenses.amount
  const [expRow] = await db
    .select({ total: sql<string>`coalesce(sum(amount), 0)` })
    .from(expensesTable)
    .where(and(gte(expensesTable.date, fromDate), lte(expensesTable.date, toDate)));

  const expenseCosts = parseFloat(expRow?.total ?? "0");

  // Expenses by category
  const expenseCategories = await db
    .select({
      category: expensesTable.category,
      amount: sql<string>`coalesce(sum(amount), 0)`,
    })
    .from(expensesTable)
    .where(and(gte(expensesTable.date, fromDate), lte(expensesTable.date, toDate)))
    .groupBy(expensesTable.category);

  const expensesByCategory: { category: string; amount: number }[] = expenseCategories.map((r) => ({
    category: r.category,
    amount: parseFloat(r.amount),
  }));

  // Add synthetic "Vendor bills" row if bill costs > 0
  if (billCosts > 0) {
    expensesByCategory.push({ category: "Vendor bills", amount: billCosts });
  }

  expensesByCategory.sort((a, b) => b.amount - a.amount);

  const costs = billCosts + expenseCosts;
  const netProfit = revenue - costs;

  res.json({
    fromDate,
    toDate,
    revenue,
    costs,
    netProfit,
    revenueByCustomer,
    expensesByCategory,
  });
});

// ── TRIAL BALANCE ──────────────────────────────────────────────────────────
router.get("/reports/trial-balance", async (_req, res): Promise<void> => {
  const asOf = new Date().toISOString().split("T")[0];

  const accounts = await db
    .select({
      id: chartOfAccountsTable.id,
      code: chartOfAccountsTable.code,
      name: chartOfAccountsTable.name,
      type: chartOfAccountsTable.type,
      balance: chartOfAccountsTable.balance,
    })
    .from(chartOfAccountsTable)
    .where(eq(chartOfAccountsTable.isActive, true))
    .orderBy(sql`code asc`);

  // Debit-natural types: asset, expense
  // Credit-natural types: liability, equity, revenue
  // Negative balance on natural side → put abs(balance) on opposite side
  const rows = accounts.map((acct) => {
    const balance = parseFloat(String(acct.balance));
    const type = acct.type.toLowerCase();
    const isDebitNatural = type === "asset" || type === "expense";

    let debit = 0;
    let credit = 0;

    if (isDebitNatural) {
      if (balance >= 0) {
        debit = balance;
      } else {
        credit = Math.abs(balance);
      }
    } else {
      // credit-natural: liability, equity, revenue (and any unrecognized type)
      if (balance >= 0) {
        credit = balance;
      } else {
        debit = Math.abs(balance);
      }
    }

    return {
      accountId: acct.id,
      code: acct.code,
      name: acct.name,
      type: acct.type,
      debit,
      credit,
    };
  });

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  res.json({ asOf, rows, totalDebit, totalCredit, balanced });
});

export default router;
