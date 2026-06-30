# Astram Integration & Database Migration

The financial portal is being built as a standalone system first, then **migrated into
the existing Astram platform**. This document records the approach so the eventual
migration is low-risk and incremental.

## Principle

Build against our **own PostgreSQL database** now (fast iteration, no coupling), but
model entities so they map cleanly onto Astram's existing entities. The portal's schema
is split per module (`lib/db/src/schema/{assets,sales,purchases,banking,accountant}.ts`)
precisely so each table can be mapped or re-pointed independently.

## Phased approach

1. **Standalone (current).** Own DB, own schema, seeded/mock data where Astram data
   isn't yet available. Ship and validate all modules end-to-end.
2. **Entity mapping.** For each portal table, document the corresponding Astram entity
   (or "new — owned by portal"). Assets are the first integration point — they are
   expected to come *from* the existing Astram system.
3. **Shared read path.** Point read-only queries at Astram entities (views or a
   read replica) while the portal still owns its transactional tables.
4. **Write-back / consolidation.** Migrate ownership of tables into Astram's database,
   replacing portal tables with Astram-backed ones. Because access goes through Drizzle
   in `lib/db`, the rest of the app is insulated from where the data physically lives.

## What makes this safe

- **Contract-first:** the OpenAPI spec is the boundary. As long as the API contract
  holds, the database underneath can move without touching the frontend.
- **Thin data layer:** all DB access is in `lib/db` and the route handlers — there is
  no ORM logic scattered through the UI.
- **Modular schema:** per-module schema files allow table-by-table migration.

## Open items before migration

- Reconcile the **PostgreSQL vs. MariaDB** discrepancy (code is Postgres; `replit.nix`
  and `.replit` still reference MariaDB/port 3306). Pick one engine of record.
- Replace dev-only `drizzle-kit push` with **generated, reviewable SQL migrations** for
  any shared/production database.
- Define the entity-mapping table (portal table → Astram entity) — start with Assets.
