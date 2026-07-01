# Tamper-Evident Audit Ledger ("Blockchain-Grade" Integrity)

The portal records every change to financial data in an **append-only, hash-chained
audit ledger**. This applies blockchain integrity principles — a cryptographically
linked chain where altering any past record invalidates everything after it — without
the overhead of a distributed network or smart contracts, which are the wrong tool for
a single-tenant financial system.

## How it works

- **Table:** `audit_log` (`lib/db/src/schema/audit.ts`) — `id, ts, actor, action,
  entityType, entityId, payload, prevHash, hash`.
- **Chaining:** each entry stores `hash = SHA256(prevHash + canonical(entry))`, where
  `canonical` is a deterministic JSON of the hashed fields. The first entry chains from a
  genesis hash of 64 zeros.
- **Capture:** an Express middleware (`artifacts/api-server/src/middlewares/audit.ts`)
  records every successful mutating request (`POST`/`PUT`/`PATCH`/`DELETE`), capturing the
  response body (so the created/updated entity and its id are part of the immutable record).
- **Append helper & verifier:** `artifacts/api-server/src/lib/audit.ts`.

## API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/audit?limit=N` | Most-recent ledger entries (newest first) |
| `GET /api/audit/verify` | Walk the whole chain, recompute every hash; returns `{ valid, total, headHash, brokenAt? }` |

## UI

**Security → Audit Ledger** (`/audit/ledger`) lists the chain (action, entity, linked
prev-hash/hash) and has a **Verify integrity** button that calls `/audit/verify` and shows
whether the chain is intact or where it broke.

## Security properties — and the honest limit

- **Tamper-evident:** editing or deleting any historical row changes its hash, so the
  recomputed chain no longer matches and `verify` reports the exact break point. (Verified:
  altering a row's payload directly in the database makes `verify` return
  `valid:false, brokenAt:{…}`.)
- **Not tamper-proof on its own:** anyone with database write access could rewrite the
  *entire* chain (recompute every hash) and it would still verify. The hash chain proves
  internal consistency, not external immutability.

### Closing the last gap (recommended next step)

Anchor the head hash somewhere the app/DBA cannot rewrite — periodically publish
`headHash` to an external, append-only sink (a managed timestamping/notary service, a
public chain, or even a write-once log in separate infrastructure). Then a full-chain
rewrite is detectable because the recomputed head won't match the externally anchored
value. The current design exposes `headHash` from `/audit/verify` precisely so it can be
anchored.

## Known limitation

`appendAudit` reads the current head then inserts; under highly concurrent writes this
read-then-write could race. A production ledger would serialize appends (e.g. a dedicated
sequence/lock or a single-writer queue).
