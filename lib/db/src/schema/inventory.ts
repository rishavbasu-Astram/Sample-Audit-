import { mysqlTable, text, timestamp, int, decimal } from "drizzle-orm/mysql-core";

export const inventoryMovementsTable = mysqlTable("inventory_movements", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("item_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  movementType: text("movement_type").notNull(), // purchase | sale | adjustment | opening
  quantity: decimal("quantity", { precision: 15, scale: 2 }).notNull(), // signed for adjustment
  unitCost: decimal("unit_cost", { precision: 15, scale: 4 }).notNull().default("0"), // resolved cost used
  reference: text("reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type InventoryMovementRow = typeof inventoryMovementsTable.$inferSelect;
