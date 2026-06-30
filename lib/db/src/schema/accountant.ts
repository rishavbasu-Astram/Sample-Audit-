import { pgTable, text, serial, timestamp, numeric, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chartOfAccountsTable = pgTable("chart_of_accounts", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  subtype: text("subtype"),
  description: text("description"),
  balance: numeric("balance", { precision: 15, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChartOfAccountSchema = createInsertSchema(chartOfAccountsTable).omit({ id: true, createdAt: true });
export type InsertChartOfAccount = z.infer<typeof insertChartOfAccountSchema>;
export type ChartOfAccount = typeof chartOfAccountsTable.$inferSelect;

export const journalsTable = pgTable("journals", {
  id: serial("id").primaryKey(),
  journalNumber: text("journal_number").notNull(),
  type: text("type").notNull().default("manual"),
  date: text("date").notNull(),
  reference: text("reference"),
  notes: text("notes"),
  status: text("status").notNull().default("draft"),
  entries: jsonb("entries").notNull().default("[]"),
  frequency: text("frequency"),
  nextDate: text("next_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertJournalSchema = createInsertSchema(journalsTable).omit({ id: true, createdAt: true });
export type InsertJournal = z.infer<typeof insertJournalSchema>;
export type Journal = typeof journalsTable.$inferSelect;

export const budgetsTable = pgTable("budgets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  fiscalYear: text("fiscal_year").notNull(),
  period: text("period").notNull(),
  status: text("status").notNull().default("draft"),
  totalBudgeted: numeric("total_budgeted", { precision: 15, scale: 2 }).notNull().default("0"),
  totalActual: numeric("total_actual", { precision: 15, scale: 2 }).notNull().default("0"),
  lines: jsonb("lines").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBudgetSchema = createInsertSchema(budgetsTable).omit({ id: true, createdAt: true });
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type Budget = typeof budgetsTable.$inferSelect;

export const vatPaymentsTable = pgTable("vat_payments", {
  id: serial("id").primaryKey(),
  period: text("period").notNull(),
  dueDate: text("due_date").notNull(),
  vatCollected: numeric("vat_collected", { precision: 15, scale: 2 }).notNull().default("0"),
  vatPaid: numeric("vat_paid", { precision: 15, scale: 2 }).notNull().default("0"),
  netVat: numeric("net_vat", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("pending"),
  paidDate: text("paid_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVatPaymentSchema = createInsertSchema(vatPaymentsTable).omit({ id: true, createdAt: true });
export type InsertVatPayment = z.infer<typeof insertVatPaymentSchema>;
export type VatPayment = typeof vatPaymentsTable.$inferSelect;

export const currencyAdjustmentsTable = pgTable("currency_adjustments", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  fromCurrency: text("from_currency").notNull(),
  toCurrency: text("to_currency").notNull(),
  exchangeRate: numeric("exchange_rate", { precision: 15, scale: 6 }).notNull(),
  adjustmentAmount: numeric("adjustment_amount", { precision: 15, scale: 2 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCurrencyAdjustmentSchema = createInsertSchema(currencyAdjustmentsTable).omit({ id: true, createdAt: true });
export type InsertCurrencyAdjustment = z.infer<typeof insertCurrencyAdjustmentSchema>;
export type CurrencyAdjustment = typeof currencyAdjustmentsTable.$inferSelect;

export const transactionLocksTable = pgTable("transaction_locks", {
  id: serial("id").primaryKey(),
  lockDate: text("lock_date").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTransactionLockSchema = createInsertSchema(transactionLocksTable).omit({ id: true, createdAt: true });
export type InsertTransactionLock = z.infer<typeof insertTransactionLockSchema>;
export type TransactionLock = typeof transactionLocksTable.$inferSelect;
