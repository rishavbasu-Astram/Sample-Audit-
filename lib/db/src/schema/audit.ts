import { mysqlTable, int, text } from "drizzle-orm/mysql-core";
import { json } from "../json";

/**
 * Append-only, hash-chained audit ledger ("blockchain-grade" tamper evidence).
 *
 * Every row links to the previous one: `hash = SHA256(prevHash + canonical(row))`.
 * Altering or deleting any historical row breaks every subsequent hash, which the
 * `/audit/verify` endpoint detects by walking the chain. Genesis `prevHash` is 64 zeros.
 *
 * `ts` is stored as a text ISO string (not a DB timestamp) so the exact value that
 * was hashed round-trips precisely — MySQL `timestamp` would truncate sub-second
 * precision and break verification.
 */
export const auditLogTable = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  ts: text("ts").notNull(),
  actor: text("actor").notNull().default("system"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  payload: json("payload"),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
});

export type AuditLog = typeof auditLogTable.$inferSelect;
