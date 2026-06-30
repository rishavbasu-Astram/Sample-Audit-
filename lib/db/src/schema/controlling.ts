import { mysqlTable, text, timestamp, decimal, int, boolean } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ── COST CENTER ACCOUNTING ────────────────────────────────────────────────────
// A cost center is an analytical dimension that postings are tagged against.
// `parentId` allows a simple hierarchy (no DB-level FK, matching the rest of the
// schema where customerId/vendorId are bare ints). budgeted/actual let the page
// show plan-vs-actual variance without yet tagging every posting.
export const costCentersTable = mysqlTable("cost_centers", {
  id: int("id").autoincrement().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  manager: text("manager"),
  parentId: int("parent_id"),
  budgetedAmount: decimal("budgeted_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  actualAmount: decimal("actual_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCostCenterSchema = createInsertSchema(costCentersTable).omit({ id: true, createdAt: true });
export type InsertCostCenter = z.infer<typeof insertCostCenterSchema>;
export type CostCenter = typeof costCentersTable.$inferSelect;

// ── PRODUCT COST CONTROLLING ──────────────────────────────────────────────────
// Standard vs. actual cost per product/item. Variance is derived server-side from
// (actualCost - standardCost) per unit, multiplied by produced quantity.
export const productsTable = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  category: text("category"),
  unit: text("unit"),
  standardCost: decimal("standard_cost", { precision: 15, scale: 2 }).notNull().default("0"),
  actualCost: decimal("actual_cost", { precision: 15, scale: 2 }).notNull().default("0"),
  quantity: decimal("quantity", { precision: 15, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
