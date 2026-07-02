import { mysqlTable, text, timestamp, int, decimal } from "drizzle-orm/mysql-core";
export const statementLinesTable = mysqlTable("statement_lines", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("account_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  type: text("type").notNull(), // 'debit' | 'credit'
  reference: text("reference"),
  status: text("status").notNull().default("unmatched"), // unmatched | matched | reconciled
  matchedTransactionId: int("matched_transaction_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type StatementLineRow = typeof statementLinesTable.$inferSelect;
