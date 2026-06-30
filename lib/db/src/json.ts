import { customType } from "drizzle-orm/mysql-core";

/**
 * JSON column for MySQL/MariaDB.
 *
 * MariaDB exposes JSON columns as `LONGTEXT`, so the driver returns the raw
 * string rather than a parsed value (unlike MySQL 8, where mysql2 auto-parses).
 * Drizzle's built-in `json` type therefore yields strings on MariaDB. This
 * custom type guarantees values are parsed on read and serialized on write on
 * both engines.
 */
export const json = <TData>(name: string) =>
  customType<{ data: TData; driverData: string }>({
    dataType() {
      return "json";
    },
    toDriver(value: TData): string {
      return JSON.stringify(value);
    },
    fromDriver(value: unknown): TData {
      return (typeof value === "string" ? JSON.parse(value) : value) as TData;
    },
  })(name);
