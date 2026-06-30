import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  invoicesTable,
  billsTable,
  customersTable,
  vendorsTable,
  expensesTable,
  paymentsReceivedTable,
  bankAccountsTable,
  quotesTable,
  purchaseOrdersTable,
} from "@workspace/db";
import { sql, lt, gte } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];

  const [invoiceSums] = await db
    .select({
      totalReceivable: sql<string>`coalesce(sum(amount_due), 0)`,
      overdueCount: sql<string>`coalesce(sum(case when due_date < ${today} and status not in ('paid','cancelled') then 1 else 0 end), 0)`,
    })
    .from(invoicesTable);

  const [billSums] = await db
    .select({
      totalPayable: sql<string>`coalesce(sum(amount_due), 0)`,
      overdueCount: sql<string>`coalesce(sum(case when due_date < ${today} and status not in ('paid','cancelled') then 1 else 0 end), 0)`,
    })
    .from(billsTable);

  const [revenueSums] = await db
    .select({
      totalRevenue: sql<string>`coalesce(sum(amount), 0)`,
    })
    .from(paymentsReceivedTable);

  const [expenseSums] = await db
    .select({
      totalExpenses: sql<string>`coalesce(sum(total), 0)`,
    })
    .from(expensesTable);

  const [bankSums] = await db
    .select({
      cashBalance: sql<string>`coalesce(sum(current_balance), 0)`,
    })
    .from(bankAccountsTable);

  const [quoteCount] = await db
    .select({ count: sql<string>`count(*)` })
    .from(quotesTable)
    .where(sql`status in ('draft','sent')`);

  const [poCount] = await db
    .select({ count: sql<string>`count(*)` })
    .from(purchaseOrdersTable)
    .where(sql`status in ('draft','sent','approved')`);

  const totalRevenue = parseFloat(revenueSums?.totalRevenue ?? "0");
  const totalExpenses = parseFloat(expenseSums?.totalExpenses ?? "0");

  res.json({
    totalReceivable: parseFloat(invoiceSums?.totalReceivable ?? "0"),
    totalPayable: parseFloat(billSums?.totalPayable ?? "0"),
    cashBalance: parseFloat(bankSums?.cashBalance ?? "0"),
    overdueInvoices: parseInt(invoiceSums?.overdueCount ?? "0", 10),
    overdueBills: parseInt(billSums?.overdueCount ?? "0", 10),
    totalRevenue,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
    openQuotes: parseInt(quoteCount?.count ?? "0", 10),
    openPurchaseOrders: parseInt(poCount?.count ?? "0", 10),
  });
});

router.get("/dashboard/cash-flow", async (req, res): Promise<void> => {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const currentMonth = new Date().getMonth();

  const cashFlow = [];
  for (let i = 5; i >= 0; i--) {
    const monthIndex = (currentMonth - i + 12) % 12;
    const year = new Date().getFullYear() - (currentMonth - i < 0 ? 1 : 0);
    const monthStr = String(monthIndex + 1).padStart(2, "0");
    const prefix = `${year}-${monthStr}`;

    const [income] = await db
      .select({ total: sql<string>`coalesce(sum(amount), 0)` })
      .from(paymentsReceivedTable)
      .where(sql`date like ${prefix + "%"}`);

    const [expenses] = await db
      .select({ total: sql<string>`coalesce(sum(total), 0)` })
      .from(expensesTable)
      .where(sql`date like ${prefix + "%"}`);

    const inc = parseFloat(income?.total ?? "0");
    const exp = parseFloat(expenses?.total ?? "0");

    cashFlow.push({
      period: months[monthIndex],
      income: inc,
      expenses: exp,
      net: inc - exp,
    });
  }

  res.json(cashFlow);
});

router.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  const recentInvoices = await db
    .select({ id: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber, total: invoicesTable.total, createdAt: invoicesTable.createdAt })
    .from(invoicesTable)
    .orderBy(sql`created_at desc`)
    .limit(3);

  const recentBills = await db
    .select({ id: billsTable.id, billNumber: billsTable.billNumber, total: billsTable.total, createdAt: billsTable.createdAt })
    .from(billsTable)
    .orderBy(sql`created_at desc`)
    .limit(3);

  const recentPayments = await db
    .select({ id: paymentsReceivedTable.id, amount: paymentsReceivedTable.amount, createdAt: paymentsReceivedTable.createdAt })
    .from(paymentsReceivedTable)
    .orderBy(sql`created_at desc`)
    .limit(3);

  const activities = [
    ...recentInvoices.map((inv) => ({
      id: inv.id,
      type: "invoice",
      description: `Invoice ${inv.invoiceNumber} created`,
      amount: parseFloat(String(inv.total)),
      date: inv.createdAt.toISOString(),
      reference: inv.invoiceNumber,
    })),
    ...recentBills.map((bill) => ({
      id: bill.id + 10000,
      type: "bill",
      description: `Bill ${bill.billNumber} received`,
      amount: parseFloat(String(bill.total)),
      date: bill.createdAt.toISOString(),
      reference: bill.billNumber,
    })),
    ...recentPayments.map((pmt) => ({
      id: pmt.id + 20000,
      type: "payment",
      description: `Payment received`,
      amount: parseFloat(String(pmt.amount)),
      date: pmt.createdAt.toISOString(),
      reference: `PMT-${pmt.id}`,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  res.json(activities);
});

router.get("/dashboard/ar-aging", async (req, res): Promise<void> => {
  const today = new Date();
  const d = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return d.toISOString().split("T")[0];
  };

  const invoices = await db
    .select({ dueDate: invoicesTable.dueDate, amountDue: invoicesTable.amountDue })
    .from(invoicesTable)
    .where(sql`status not in ('paid','cancelled') and amount_due > 0`);

  let current = 0, d1to30 = 0, d31to60 = 0, d61to90 = 0, over90 = 0;
  const todayStr = today.toISOString().split("T")[0];

  for (const inv of invoices) {
    const amt = parseFloat(String(inv.amountDue));
    const due = inv.dueDate;
    if (due >= todayStr) current += amt;
    else if (due >= d(30)) d1to30 += amt;
    else if (due >= d(60)) d31to60 += amt;
    else if (due >= d(90)) d61to90 += amt;
    else over90 += amt;
  }

  res.json({ current, days1to30: d1to30, days31to60: d31to60, days61to90: d61to90, over90, total: current + d1to30 + d31to60 + d61to90 + over90 });
});

router.get("/dashboard/ap-aging", async (req, res): Promise<void> => {
  const today = new Date();
  const d = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return d.toISOString().split("T")[0];
  };

  const bills = await db
    .select({ dueDate: billsTable.dueDate, amountDue: billsTable.amountDue })
    .from(billsTable)
    .where(sql`status not in ('paid','cancelled') and amount_due > 0`);

  let current = 0, d1to30 = 0, d31to60 = 0, d61to90 = 0, over90 = 0;
  const todayStr = today.toISOString().split("T")[0];

  for (const bill of bills) {
    const amt = parseFloat(String(bill.amountDue));
    const due = bill.dueDate;
    if (due >= todayStr) current += amt;
    else if (due >= d(30)) d1to30 += amt;
    else if (due >= d(60)) d31to60 += amt;
    else if (due >= d(90)) d61to90 += amt;
    else over90 += amt;
  }

  res.json({ current, days1to30: d1to30, days31to60: d31to60, days61to90: d61to90, over90, total: current + d1to30 + d31to60 + d61to90 + over90 });
});

export default router;
