# Sync State Schema Design

## Context

The PostgreSQL migration is complete and the backend is stable, but the database is still operating like a prototype cache:

- `klines` stores bars
- `symbols` stores market metadata
- historical pagination state is inferred per request
- realtime sync health is not persisted

This means the service does not know, across restarts, whether a market/interval has more history, when it was last synced, or what the last sync failure was.

## Goals

- Persist historical and realtime sync state for K-line data.
- Persist symbol metadata sync state.
- Let the backend use durable sync state instead of guessing from page size.
- Keep the scope tight: no trade tick warehouse, no full job scheduler, no operator UI in this pass.

## Recommended Scope

Add two new PostgreSQL tables:

1. `kline_sync_state`
2. `symbol_sync_state`

Do not change the fundamental meaning of the existing `klines` and `symbols` tables.

## Schema

### `kline_sync_state`

Logical key: `exchange + symbol + interval`

Fields:

- `exchange`
- `symbol`
- `interval`
- `earliest_open_time`
- `latest_open_time`
- `has_more_history`
- `last_history_sync_at`
- `last_realtime_sync_at`
- `last_history_error`
- `last_realtime_error`
- `source`
- `created_at`
- `updated_at`

Purpose:

- persist how far history has been backfilled
- track whether more history likely exists
- track latest successful realtime update
- retain last failure for history and realtime paths

### `symbol_sync_state`

Logical key: `exchange + type`

Fields:

- `exchange`
- `type`
- `status`
- `symbol_count`
- `last_sync_at`
- `last_error`
- `created_at`
- `updated_at`

Purpose:

- record whether symbol refresh is healthy
- show how many symbols were last synced
- preserve last symbol sync failure instead of silently returning stale rows

## Data Flow

### Symbol refresh path

When an exchange symbol fetch succeeds:

- upsert rows into `symbols`
- update `symbol_sync_state.last_sync_at`
- update `symbol_sync_state.symbol_count`
- set `status = 'idle'`
- clear `last_error`

When it fails:

- keep old `symbols`
- update `symbol_sync_state.status = 'error'`
- update `last_error`

### Historical K-line path

When `getKlines()` fetches remote history successfully:

- save the returned bars
- update `earliest_open_time` and `latest_open_time`
- update `has_more_history`
- update `last_history_sync_at`
- clear `last_history_error`

When it fails:

- leave existing bars untouched
- update `last_history_error`

### Realtime K-line path

When realtime K-lines are persisted successfully:

- update `latest_open_time`
- update `last_realtime_sync_at`
- clear `last_realtime_error`

When persistence fails:

- update `last_realtime_error`

## Migration Strategy

Use additive schema migration only:

- create new tables with `CREATE TABLE IF NOT EXISTS`
- add unique constraints and indexes needed for upsert and lookups
- do not rebuild the existing database

Initial backfill should be lightweight:

- derive `earliest_open_time` and `latest_open_time` from current `klines`
- derive `symbol_count` from current `symbols`
- initialize `has_more_history` conservatively to `true` where K-line data exists
- let future real pagination refine the flag

This avoids a full historical rescan and keeps rollout low risk.

## Backend Behavior Changes

- `api/klines` can use persisted `has_more_history` as the primary source of truth after history fetches and backfills update state.
- history pagination continues to work as it does now: initial `2000`, older page `1000`.
- no new public API is required in this pass.

## Error Handling

- state updates must not erase existing bar data on failure
- sync-state writes should use upsert semantics
- failure strings should be short, operator-readable messages, not giant stack dumps

## Testing

Database tests:

- schema creation for both state tables
- upsert semantics for `kline_sync_state`
- upsert semantics for `symbol_sync_state`
- backfill from existing `klines` and `symbols`

Service tests:

- successful history fetch updates history sync fields
- failed history fetch updates `last_history_error`
- successful realtime save updates realtime sync fields
- failed realtime save updates `last_realtime_error`

Integration checks:

- migration script populates both state tables on the server
- backend still returns bars correctly for initial load and historical pagination

## Out Of Scope

- `trade_ticks`
- job scheduler tables
- operator dashboards
- exposing sync-state tables directly to the frontend
