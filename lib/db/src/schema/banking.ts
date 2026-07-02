import { mysqlTable, text, timestamp, decimal, int, boolean } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const bankAccountsTable = mysqlTable("bank_accounts", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  accountNumber: text("account_number"),
  bankName: text("bank_name"),
  accountType: text("account_type").notNull(),
  currency: text("currency").notNull().default("USD"),
  currentBalance: decimal("current_balance", { precision: 15, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBankAccountSchema = createInsertSchema(bankAccountsTable).omit({ id: true, createdAt: true });
export type InsertBankAccount = z.infer<typeof insertBankAccountSchema>;
export type BankAccount = typeof bankAccountsTable.$inferSelect;

export const bankTransactionsTable = mysqlTable("bank_transactions", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("account_id").notNull(),
  date: text("date").notNull(),
  type: text("type").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  description: text("description").notNull(),
  reference: text("reference"),
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBankTransactionSchema = createInsertSchema(bankTransactionsTable).omit({ id: true, createdAt: true });
export type InsertBankTransaction = z.infer<typeof insertBankTransactionSchema>;
export type BankTransaction = typeof bankTransactionsTable.$inferSelect;

export const bankTransfersTable = mysqlTable("bank_transfers", {
  id: int("id").autoincrement().primaryKey(),
  fromAccountId: int("from_account_id").notNull(),
  toAccountId: int("to_account_id").notNull(),
  date: text("date").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  description: text("description"),
  reference: text("reference"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type BankTransferRow = typeof bankTransfersTable.$inferSelect;
