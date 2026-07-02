import { mysqlTable, text, timestamp, int, boolean, decimal } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const taxRatesTable = mysqlTable("tax_rates", {
  id: int("id").autoincrement().primaryKey(),
  name: text("name").notNull(),
  rate: decimal("rate", { precision: 7, scale: 4 }).notNull().default("0"), // percent, e.g. 18.0000
  taxType: text("tax_type").notNull().default("vat"), // vat | gst | sales_tax | withholding | other
  isCompound: boolean("is_compound").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTaxRateSchema = createInsertSchema(taxRatesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTaxRate = z.infer<typeof insertTaxRateSchema>;
export type TaxRateRow = typeof taxRatesTable.$inferSelect;
