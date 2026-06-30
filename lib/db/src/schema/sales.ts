import { pgTable, text, serial, timestamp, numeric, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  address: text("address"),
  taxNumber: text("tax_number"),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull().default("active"),
  outstandingBalance: numeric("outstanding_balance", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;

export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  quoteNumber: text("quote_number").notNull(),
  customerId: integer("customer_id").notNull(),
  date: text("date").notNull(),
  expiryDate: text("expiry_date"),
  status: text("status").notNull().default("draft"),
  subtotal: numeric("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  lineItems: jsonb("line_items").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({ id: true, createdAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;

export const salesOrdersTable = pgTable("sales_orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  customerId: integer("customer_id").notNull(),
  date: text("date").notNull(),
  deliveryDate: text("delivery_date"),
  status: text("status").notNull().default("draft"),
  subtotal: numeric("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  lineItems: jsonb("line_items").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSalesOrderSchema = createInsertSchema(salesOrdersTable).omit({ id: true, createdAt: true });
export type InsertSalesOrder = z.infer<typeof insertSalesOrderSchema>;
export type SalesOrder = typeof salesOrdersTable.$inferSelect;

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull(),
  customerId: integer("customer_id").notNull(),
  date: text("date").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("draft"),
  subtotal: numeric("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  taxAmount: numeric("tax_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 15, scale: 2 }).notNull().default("0"),
  amountPaid: numeric("amount_paid", { precision: 15, scale: 2 }).notNull().default("0"),
  amountDue: numeric("amount_due", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  lineItems: jsonb("line_items").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;

export const salesReceiptsTable = pgTable("sales_receipts", {
  id: serial("id").primaryKey(),
  receiptNumber: text("receipt_number").notNull(),
  customerId: integer("customer_id").notNull(),
  date: text("date").notNull(),
  paymentMethod: text("payment_method").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  lineItems: jsonb("line_items").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSalesReceiptSchema = createInsertSchema(salesReceiptsTable).omit({ id: true, createdAt: true });
export type InsertSalesReceipt = z.infer<typeof insertSalesReceiptSchema>;
export type SalesReceipt = typeof salesReceiptsTable.$inferSelect;

export const recurringInvoicesTable = pgTable("recurring_invoices", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  frequency: text("frequency").notNull(),
  nextDate: text("next_date").notNull(),
  status: text("status").notNull().default("active"),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRecurringInvoiceSchema = createInsertSchema(recurringInvoicesTable).omit({ id: true, createdAt: true });
export type InsertRecurringInvoice = z.infer<typeof insertRecurringInvoiceSchema>;
export type RecurringInvoice = typeof recurringInvoicesTable.$inferSelect;

export const paymentLinksTable = pgTable("payment_links", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  url: text("url").notNull(),
  status: text("status").notNull().default("active"),
  expiresAt: text("expires_at"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPaymentLinkSchema = createInsertSchema(paymentLinksTable).omit({ id: true, createdAt: true });
export type InsertPaymentLink = z.infer<typeof insertPaymentLinkSchema>;
export type PaymentLink = typeof paymentLinksTable.$inferSelect;

export const paymentsReceivedTable = pgTable("payments_received", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  date: text("date").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  reference: text("reference"),
  invoiceId: integer("invoice_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPaymentReceivedSchema = createInsertSchema(paymentsReceivedTable).omit({ id: true, createdAt: true });
export type InsertPaymentReceived = z.infer<typeof insertPaymentReceivedSchema>;
export type PaymentReceived = typeof paymentsReceivedTable.$inferSelect;

export const creditNotesTable = pgTable("credit_notes", {
  id: serial("id").primaryKey(),
  creditNoteNumber: text("credit_note_number").notNull(),
  customerId: integer("customer_id").notNull(),
  date: text("date").notNull(),
  status: text("status").notNull().default("draft"),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  balance: numeric("balance", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  lineItems: jsonb("line_items").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCreditNoteSchema = createInsertSchema(creditNotesTable).omit({ id: true, createdAt: true });
export type InsertCreditNote = z.infer<typeof insertCreditNoteSchema>;
export type CreditNote = typeof creditNotesTable.$inferSelect;
