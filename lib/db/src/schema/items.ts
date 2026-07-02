import { mysqlTable, text, timestamp, int, boolean, decimal } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const itemsTable = mysqlTable("items", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  itemType: text("item_type").notNull().default("service"), // 'goods' | 'service'
  sku: text("sku"),
  unit: text("unit"),
  description: text("description"),
  sellingPrice: decimal("selling_price", { precision: 15, scale: 2 }).notNull().default("0"),
  costPrice: decimal("cost_price", { precision: 15, scale: 2 }).notNull().default("0"),
  taxRateId: int("tax_rate_id"),
  trackInventory: boolean("track_inventory").notNull().default(false),
  stockOnHand: decimal("stock_on_hand", { precision: 15, scale: 2 }).notNull().default("0"),
  reorderLevel: decimal("reorder_level", { precision: 15, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertItemSchema = createInsertSchema(itemsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertItem = z.infer<typeof insertItemSchema>;
export type ItemRow = typeof itemsTable.$inferSelect;
