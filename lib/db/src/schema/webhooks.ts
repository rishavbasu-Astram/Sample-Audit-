import { mysqlTable, text, timestamp, int, boolean } from "drizzle-orm/mysql-core";
import { json } from "../json";

export const webhooksTable = mysqlTable("webhooks", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  events: json<string[]>("events").notNull(), // e.g. ["invoice.CREATE","invoice.*","*"]
  secret: text("secret"), // HMAC key; never exposed via the API
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const webhookDeliveriesTable = mysqlTable("webhook_deliveries", {
  id: int("id").autoincrement().primaryKey(),
  webhookId: int("webhook_id").notNull(),
  event: text("event").notNull(),
  payload: json<unknown>("payload"),
  status: text("status").notNull().default("pending"), // delivered | failed
  responseCode: int("response_code"),
  error: text("error"),
  durationMs: int("duration_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WebhookRow = typeof webhooksTable.$inferSelect;
export type WebhookDeliveryRow = typeof webhookDeliveriesTable.$inferSelect;
