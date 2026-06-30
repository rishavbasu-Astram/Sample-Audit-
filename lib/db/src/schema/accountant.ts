import { mysqlTable, text, timestamp, decimal, int, boolean } from "drizzle-orm/mysql-core";
import { json } from "../json";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chartOfAccountsTable = mysqlTable("chart_of_accounts", {
  id: int("id").autoincrement().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  subtype: text("subtype"),
  description: text("description"),
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertChartOfAccountSchema = createInsertSchema(chartOfAccountsTable).omit({ id: true, createdAt: true });
export type InsertChartOfAccount = z.infer<typeof insertChartOfAccountSchema>;
export type ChartOfAccount = typeof chartOfAccountsTable.$inferSelect;

export const journalsTable = mysqlTable("journals", {
  id: int("id").autoincrement().primaryKey(),
  journalNumber: text("journal_number").notNull(),
  type: text("type").notNull().default("manual"),
  date: text("date").notNull(),
  reference: text("reference"),
  notes: text("notes"),
  status: text("status").notNull().default("draft"),
  entries: json("entries").notNull().default([]),
  frequency: text("frequency"),
  nextDate: text("next_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertJournalSchema = createInsertSchema(journalsTable).omit({ id: true, createdAt: true });
export type InsertJournal = z.infer<typeof insertJournalSchema>;
export type Journal = typeof journalsTable.$inferSelect;

export const budgetsTable = mysqlTable("budgets", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  fiscalYear: text("fiscal_year").notNull(),
  period: text("period").notNull(),
  status: text("status").notNull().default("draft"),
  totalBudgeted: decimal("total_budgeted", { precision: 15, scale: 2 }).notNull().default("0"),
  totalActual: decimal("total_actual", { precision: 15, scale: 2 }).notNull().default("0"),
  lines: json("lines").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBudgetSchema = createInsertSchema(budgetsTable).omit({ id: true, createdAt: true });
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type Budget = typeof budgetsTable.$inferSelect;

export const vatPaymentsTable = mysqlTable("vat_payments", {
  id: int("id").autoincrement().primaryKey(),
  period: text("period").notNull(),
  dueDate: text("due_date").notNull(),
  vatCollected: decimal("vat_collected", { precision: 15, scale: 2 }).notNull().default("0"),
  vatPaid: decimal("vat_paid", { precision: 15, scale: 2 }).notNull().default("0"),
  netVat: decimal("net_vat", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("pending"),
  paidDate: text("paid_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVatPaymentSchema = createInsertSchema(vatPaymentsTable).omit({ id: true, createdAt: true });
export type InsertVatPayment = z.infer<typeof insertVatPaymentSchema>;
export type VatPayment = typeof vatPaymentsTable.$inferSelect;

export const currencyAdjustmentsTable = mysqlTable("currency_adjustments", {
  id: int("id").autoincrement().primaryKey(),
  date: text("date").notNull(),
  fromCurrency: text("from_currency").notNull(),
  toCurrency: text("to_currency").notNull(),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).notNull(),
  adjustmentAmount: decimal("adjustment_amount", { precision: 15, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCurrencyAdjustmentSchema = createInsertSchema(currencyAdjustmentsTable).omit({ id: true, createdAt: true });
export type InsertCurrencyAdjustment = z.infer<typeof insertCurrencyAdjustmentSchema>;
export type CurrencyAdjustment = typeof currencyAdjustmentsTable.$inferSelect;

export const transactionLocksTable = mysqlTable("transaction_locks", {
  id: int("id").autoincrement().primaryKey(),
  lockDate: text("lock_date").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTransactionLockSchema = createInsertSchema(transactionLocksTable).omit({ id: true, createdAt: true });
export type InsertTransactionLock = z.infer<typeof insertTransactionLockSchema>;
export type TransactionLock = typeof transactionLocksTable.$inferSelect;
