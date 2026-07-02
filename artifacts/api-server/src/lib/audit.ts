import crypto from "node:crypto";
import { db, auditLogTable, type AuditLog } from "@workspace/db";
import { desc, asc } from "drizzle-orm";
import { dispatchWebhookEvent } from "./webhooks";

/** Genesis predecessor hash for the first entry in the chain. */
const GENESIS = "0".repeat(64);

interface CanonicalRow {
  ts: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: unknown;
}

/** Deterministic serialization of the hashed fields. */
function canonical(row: CanonicalRow): string {
  return JSON.stringify({
    ts: row.ts,
    actor: row.actor,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId ?? null,
    payload: row.payload ?? null,
  });
}

function computeHash(prevHash: string, content: string): string {
  return crypto.createHash("sha256").update(prevHash + content).digest("hex");
}

export interface AuditInput {
  actor?: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  payload?: unknown;
}

/**
 * Append a tamper-evident entry, chaining to the current head of the ledger.
 * (For a sample app this read-then-insert is fine; a production ledger would
 * serialize appends to avoid a race on the head under concurrent writes.)
 */
export async function appendAudit(input: AuditInput): Promise<void> {
  const [last] = await db
    .select({ hash: auditLogTable.hash })
    .from(auditLogTable)
    .orderBy(desc(auditLogTable.id))
    .limit(1);

  const prevHash = last?.hash ?? GENESIS;
  const row: CanonicalRow = {
    ts: new Date().toISOString(),
    actor: input.actor ?? "system",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    payload: input.payload ?? null,
  };
  const hash = computeHash(prevHash, canonical(row));

  await db.insert(auditLogTable).values({ ...row, prevHash, hash });

  void dispatchWebhookEvent(`${row.entityType}.${row.action}`, {
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    actor: row.actor,
    ts: row.ts,
    payload: row.payload ?? null,
  }).catch(() => {});
}

export interface VerifyResult {
  valid: boolean;
  total: number;
  headHash: string | null;
  brokenAt?: { id: number; seq: number };
}

/** Walk the chain from genesis and recompute every hash to detect tampering. */
export async function verifyChain(): Promise<VerifyResult> {
  const rows: AuditLog[] = await db
    .select()
    .from(auditLogTable)
    .orderBy(asc(auditLogTable.id));

  let prevHash = GENESIS;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const expected = computeHash(prevHash, canonical(r));
    if (r.prevHash !== prevHash || r.hash !== expected) {
      return { valid: false, total: rows.length, headHash: null, brokenAt: { id: r.id, seq: i + 1 } };
    }
    prevHash = r.hash;
  }
  return { valid: true, total: rows.length, headHash: prevHash === GENESIS ? null : prevHash };
}
