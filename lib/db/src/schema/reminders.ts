import { mysqlTable, text, timestamp, int, boolean, decimal } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── PAYMENT REMINDERS / DUNNING (blueprint §1 + §8.4) ─────────────────────────
// A reminder rule fires relative to an invoice's due date. The scheduler scans
// open invoices every tick and, for each active rule, mints a reminder_log entry
// when a rule's occurrence date has arrived (and hasn't already fired). Delivery
// is stubbed as a logged event in this slice — the `channel` + rendered message
// are recorded so swapping in a real email/SMS service is a one-function change.
//
// offsetDays: negative = before due date, 0 = on due date, positive = overdue.
// repeatEveryDays: if set, keep re-firing every N days after the first occurrence
//   (overdue nudges), capped by maxReminders total occurrences.

export const reminderRulesTable = mysqlTable("reminder_rules", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  offsetDays: int("offset_days").notNull().default(0),
  repeatEveryDays: int("repeat_every_days"),
  maxReminders: int("max_reminders"),
  channel: text("channel").notNull().default("email"), // email|sms|log (delivery stubbed)
  subject: text("subject").notNull().default("Payment reminder: invoice {{invoiceNumber}}"),
  bodyTemplate: text("body_template")
    .notNull()
    .default(
      "Hi {{customerName}}, invoice {{invoiceNumber}} for {{amountDue}} is due on {{dueDate}}. Please arrange payment. Thank you.",
    ),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertReminderRuleSchema = createInsertSchema(reminderRulesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertReminderRule = z.infer<typeof insertReminderRuleSchema>;
export type ReminderRule = typeof reminderRulesTable.$inferSelect;

export const reminderLogTable = mysqlTable("reminder_log", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoice_id").notNull(),
  ruleId: int("rule_id").notNull(),
  customerId: int("customer_id").notNull(),
  occurrenceDate: text("occurrence_date").notNull(), // scheduled fire date; part of the dedup key
  dueDate: text("due_date").notNull(),
  amountDue: decimal("amount_due", { precision: 15, scale: 2 }).notNull(),
  channel: text("channel").notNull(),
  recipient: text("recipient"), // resolved email address (null when none on file / non-email channel)
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("sent"), // sent|failed|simulated|skipped
  sentAt: timestamp("sent_at").notNull().defaultNow(),
});

export type ReminderLog = typeof reminderLogTable.$inferSelect;
