import { mysqlTable, text, timestamp, decimal, int } from "drizzle-orm/mysql-core";
import { json } from "../json";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customersTable = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  address: text("address"),
  taxNumber: text("tax_number"),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull().default("active"),
  outstandingBalance: decimal("outstanding_balance", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;

export const quotesTable = mysqlTable("quotes", {
  id: int("id").autoincrement().primaryKey(),
  quoteNumber: text("quote_number").notNull(),
  customerId: int("customer_id").notNull(),
  date: text("date").notNull(),
  expiryDate: text("expiry_date"),
  status: text("status").notNull().default("draft"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  lineItems: json("line_items").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({ id: true, createdAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;

export const salesOrdersTable = mysqlTable("sales_orders", {
  id: int("id").autoincrement().primaryKey(),
  orderNumber: text("order_number").notNull(),
  customerId: int("customer_id").notNull(),
  date: text("date").notNull(),
  deliveryDate: text("delivery_date"),
  status: text("status").notNull().default("draft"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  lineItems: json("line_items").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSalesOrderSchema = createInsertSchema(salesOrdersTable).omit({ id: true, createdAt: true });
export type InsertSalesOrder = z.infer<typeof insertSalesOrderSchema>;
export type SalesOrder = typeof salesOrdersTable.$inferSelect;

export const invoicesTable = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  invoiceNumber: text("invoice_number").notNull(),
  customerId: int("customer_id").notNull(),
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

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;

export const salesReceiptsTable = mysqlTable("sales_receipts", {
  id: int("id").autoincrement().primaryKey(),
  receiptNumber: text("receipt_number").notNull(),
  customerId: int("customer_id").notNull(),
  date: text("date").notNull(),
  paymentMethod: text("payment_method").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  lineItems: json("line_items").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSalesReceiptSchema = createInsertSchema(salesReceiptsTable).omit({ id: true, createdAt: true });
export type InsertSalesReceipt = z.infer<typeof insertSalesReceiptSchema>;
export type SalesReceipt = typeof salesReceiptsTable.$inferSelect;

export const recurringInvoicesTable = mysqlTable("recurring_invoices", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull(),
  frequency: text("frequency").notNull(),
  nextDate: text("next_date").notNull(),
  status: text("status").notNull().default("active"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRecurringInvoiceSchema = createInsertSchema(recurringInvoicesTable).omit({ id: true, createdAt: true });
export type InsertRecurringInvoice = z.infer<typeof insertRecurringInvoiceSchema>;
export type RecurringInvoice = typeof recurringInvoicesTable.$inferSelect;

export const paymentLinksTable = mysqlTable("payment_links", {
  id: int("id").autoincrement().primaryKey(),
  title: text("title").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  url: text("url").notNull(),
  status: text("status").notNull().default("active"),
  expiresAt: text("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPaymentLinkSchema = createInsertSchema(paymentLinksTable).omit({ id: true, createdAt: true });
export type InsertPaymentLink = z.infer<typeof insertPaymentLinkSchema>;
export type PaymentLink = typeof paymentLinksTable.$inferSelect;

export const paymentsReceivedTable = mysqlTable("payments_received", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customer_id").notNull(),
  date: text("date").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  reference: text("reference"),
  invoiceId: int("invoice_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPaymentReceivedSchema = createInsertSchema(paymentsReceivedTable).omit({ id: true, createdAt: true });
export type InsertPaymentReceived = z.infer<typeof insertPaymentReceivedSchema>;
export type PaymentReceived = typeof paymentsReceivedTable.$inferSelect;

export const creditNotesTable = mysqlTable("credit_notes", {
  id: int("id").autoincrement().primaryKey(),
  creditNoteNumber: text("credit_note_number").notNull(),
  customerId: int("customer_id").notNull(),
  date: text("date").notNull(),
  status: text("status").notNull().default("draft"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  lineItems: json("line_items").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCreditNoteSchema = createInsertSchema(creditNotesTable).omit({ id: true, createdAt: true });
export type InsertCreditNote = z.infer<typeof insertCreditNoteSchema>;
export type CreditNote = typeof creditNotesTable.$inferSelect;
