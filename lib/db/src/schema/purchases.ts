import { mysqlTable, text, int, timestamp, decimal } from "drizzle-orm/mysql-core";
import { json } from "../json";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vendorsTable = mysqlTable("vendors", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  address: text("address"),
  taxNumber: text("tax_number"),
  currency: text("currency").notNull().default("USD"),
  outstandingBalance: decimal("outstanding_balance", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVendorSchema = createInsertSchema(vendorsTable).omit({ id: true, createdAt: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendorsTable.$inferSelect;

export const expensesTable = mysqlTable("expenses", {
  id: int("id").autoincrement().primaryKey(),
  vendorId: int("vendor_id"),
  date: text("date").notNull(),
  category: text("category").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  reference: text("reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;

export const recurringExpensesTable = mysqlTable("recurring_expenses", {
  id: int("id").autoincrement().primaryKey(),
  vendorId: int("vendor_id"),
  category: text("category").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  frequency: text("frequency").notNull(),
  nextDate: text("next_date").notNull(),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRecurringExpenseSchema = createInsertSchema(recurringExpensesTable).omit({ id: true, createdAt: true });
export type InsertRecurringExpense = z.infer<typeof insertRecurringExpenseSchema>;
export type RecurringExpense = typeof recurringExpensesTable.$inferSelect;

export const purchaseOrdersTable = mysqlTable("purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  poNumber: text("po_number").notNull(),
  vendorId: int("vendor_id").notNull(),
  date: text("date").notNull(),
  expectedDate: text("expected_date"),
  status: text("status").notNull().default("draft"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  lineItems: json("line_items").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrdersTable).omit({ id: true, createdAt: true });
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;

export const billsTable = mysqlTable("bills", {
  id: int("id").autoincrement().primaryKey(),
  billNumber: text("bill_number").notNull(),
  vendorId: int("vendor_id").notNull(),
  date: text("date").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("draft"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull().default("0"),
  amountPaid: decimal("amount_paid", { precision: 15, scale: 2 }).notNull().default("0"),
  amountDue: decimal("amount_due", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  lineItems: json("line_items").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBillSchema = createInsertSchema(billsTable).omit({ id: true, createdAt: true });
export type InsertBill = z.infer<typeof insertBillSchema>;
export type Bill = typeof billsTable.$inferSelect;

export const recurringBillsTable = mysqlTable("recurring_bills", {
  id: int("id").autoincrement().primaryKey(),
  vendorId: int("vendor_id").notNull(),
  frequency: text("frequency").notNull(),
  nextDate: text("next_date").notNull(),
  status: text("status").notNull().default("active"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRecurringBillSchema = createInsertSchema(recurringBillsTable).omit({ id: true, createdAt: true });
export type InsertRecurringBill = z.infer<typeof insertRecurringBillSchema>;
export type RecurringBill = typeof recurringBillsTable.$inferSelect;

export const paymentsMadeTable = mysqlTable("payments_made", {
  id: int("id").autoincrement().primaryKey(),
  vendorId: int("vendor_id").notNull(),
  date: text("date").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  reference: text("reference"),
  billId: int("bill_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPaymentMadeSchema = createInsertSchema(paymentsMadeTable).omit({ id: true, createdAt: true });
export type InsertPaymentMade = z.infer<typeof insertPaymentMadeSchema>;
export type PaymentMade = typeof paymentsMadeTable.$inferSelect;

export const vendorCreditsTable = mysqlTable("vendor_credits", {
  id: int("id").autoincrement().primaryKey(),
  vendorCreditNumber: text("vendor_credit_number").notNull(),
  vendorId: int("vendor_id").notNull(),
  date: text("date").notNull(),
  status: text("status").notNull().default("draft"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  lineItems: json("line_items").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVendorCreditSchema = createInsertSchema(vendorCreditsTable).omit({ id: true, createdAt: true });
export type InsertVendorCredit = z.infer<typeof insertVendorCreditSchema>;
export type VendorCredit = typeof vendorCreditsTable.$inferSelect;
