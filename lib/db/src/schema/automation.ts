import { mysqlTable, text, timestamp, int } from "drizzle-orm/mysql-core";
import { json } from "../json";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── RECURRING AUTOMATION ENGINE (blueprint §8.3) ──────────────────────────────
// A recurring profile is a "parent" template that the scheduler mints child
// records from on a cadence. The blueprint models profiles generically across
// invoice/bill/expense/journal; this first slice wires the `invoice` entity type
// only (the one that produces visible, verifiable output — a real invoices row).
//
// Divergence from the raw blueprint spec, kept deliberately: `customerId` is a
// first-class column rather than living inside `templateData`, because it is the
// notNull join key needed to mint an invoice and to show the customer in the list
// without parsing JSON. The money fields + line items live in `templateData`.

// Shape of templateData for entityType='invoice'. Stored via the custom json type,
// so it is parsed to an object on read.
export type InvoiceTemplate = {
  subtotal: number;
  taxAmount: number;
  total: number;
  dueInDays: number; // child dueDate = generation date + dueInDays
  notes?: string;
  lineItems?: unknown[];
};

export const recurringProfilesTable = mysqlTable("recurring_profiles", {
  id: int("id").autoincrement().primaryKey(),
  entityType: text("entity_type").notNull().default("invoice"), // 'invoice' wired
  name: text("name").notNull(),
  customerId: int("customer_id").notNull(),
  templateData: json("template_data").$type<InvoiceTemplate>().notNull(),
  frequency: text("frequency").notNull(), // daily|weekly|biweekly|monthly|quarterly|yearly|custom
  customDays: int("custom_days"),
  automationMode: text("automation_mode").notNull().default("draft"), // 'draft' wired
  nextRunAt: timestamp("next_run_at").notNull(),
  lastRunAt: timestamp("last_run_at"),
  endAt: timestamp("end_at"),
  status: text("status").notNull().default("active"), // active|paused|expired
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRecurringProfileSchema = createInsertSchema(recurringProfilesTable).omit({
  id: true,
  createdAt: true,
  lastRunAt: true,
});
export type InsertRecurringProfile = z.infer<typeof insertRecurringProfileSchema>;
export type RecurringProfile = typeof recurringProfilesTable.$inferSelect;

export const recurringChildrenTable = mysqlTable("recurring_children", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profile_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: int("entity_id").notNull(), // ID of the created invoice
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  status: text("status").notNull(), // mirrors the child entity status, e.g. 'draft'
});

export type RecurringChild = typeof recurringChildrenTable.$inferSelect;
