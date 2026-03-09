# Sync State Schema Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add durable PostgreSQL sync-state tables for K-line and symbol ingestion so the backend can persist sync progress, failure state, and historical availability across restarts.

**Architecture:** Extend the PostgreSQL schema with `kline_sync_state` and `symbol_sync_state`, add database helpers for upsert and backfill, then update the existing symbol, history, and realtime K-line flows to maintain those tables. Keep public APIs stable and reuse current pagination behavior while replacing request-time guesses with persisted state.

**Tech Stack:** TypeScript, PostgreSQL, pg, Vitest, PM2

---

### Task 1: Add failing database tests for sync-state schema

**Files:**
- Modify: `backend/src/database/postgres.test.ts`
- Reference: `backend/src/database/postgres.ts`

**Step 1: Write the failing tests**

- Add a test that expects `kline_sync_state` and `symbol_sync_state` tables to be created during initialization.
- Add a test that expects helper methods to upsert sync-state rows and read them back.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/database/postgres.test.ts`
Expected: FAIL because the new tables and helper methods do not exist yet.

**Step 3: Implement the minimal schema and helper methods**

- Create both tables in `DatabaseService.init()`.
- Add typed methods for:
  - `upsertKlineSyncState(...)`
  - `upsertSymbolSyncState(...)`
  - `getKlineSyncState(...)`
  - `getSymbolSyncState(...)`

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/database/postgres.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/database/postgres.ts backend/src/database/postgres.test.ts
git commit -m "feat: 添加 PostgreSQL 同步状态表"
```

### Task 2: Add failing tests for backfill from existing data

**Files:**
- Modify: `backend/src/database/postgres.test.ts`
- Modify: `backend/scripts/migrate-sqlite-to-postgres.ts`

**Step 1: Write the failing tests**

- Add a test that seeds `klines` and verifies a backfill helper computes `earliest_open_time`, `latest_open_time`, and default `has_more_history`.
- Add a test that seeds `symbols` and verifies symbol sync-state backfill computes `symbol_count`.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/database/postgres.test.ts`
Expected: FAIL because no backfill helpers exist.

**Step 3: Implement minimal backfill helpers**

- Add database methods to aggregate existing `klines` and `symbols` into sync-state rows.
- Call those helpers from the SQLite-to-PostgreSQL migration script after data import.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/database/postgres.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/database/postgres.ts backend/src/database/postgres.test.ts backend/scripts/migrate-sqlite-to-postgres.ts
git commit -m "feat: 回填同步状态初始数据"
```

### Task 3: Add failing tests for symbol sync-state maintenance

**Files:**
- Modify: `backend/src/services/kline.service.test.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/database/postgres.ts`

**Step 1: Write the failing tests**

- Add a test that verifies symbol refresh success updates `symbol_sync_state` with count and cleared error.
- Add a test that verifies symbol refresh failure records `last_error` without deleting existing symbol rows.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/services/kline.service.test.ts`
Expected: FAIL because symbol sync-state is not updated yet.

**Step 3: Implement minimal production code**

- Update the symbol initialization path in `server.ts` to write success and error state.
- Keep symbol row persistence behavior unchanged aside from sync-state writes.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/services/kline.service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/server.ts backend/src/services/kline.service.test.ts backend/src/database/postgres.ts
git commit -m "feat: 记录交易对同步状态"
```

### Task 4: Add failing tests for historical K-line sync-state maintenance

**Files:**
- Modify: `backend/src/services/kline.service.test.ts`
- Modify: `backend/src/services/kline.service.ts`
- Modify: `backend/src/database/postgres.ts`

**Step 1: Write the failing tests**

- Add a test that verifies successful remote history fetch updates:
  - `earliest_open_time`
  - `latest_open_time`
  - `has_more_history`
  - `last_history_sync_at`
  - cleared `last_history_error`
- Add a test that verifies failed remote history fetch records `last_history_error`.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/services/kline.service.test.ts`
Expected: FAIL because history sync-state is not updated yet.

**Step 3: Implement minimal production code**

- Update `KlineService.getKlines()` to write history sync-state after successful remote fetch.
- On remote failure, write a short history error message.
- Preserve existing return semantics for `klines`, `source`, and `hasMore`.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/services/kline.service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/kline.service.ts backend/src/services/kline.service.test.ts backend/src/database/postgres.ts
git commit -m "feat: 记录历史 K 线同步状态"
```

### Task 5: Add failing tests for realtime K-line sync-state maintenance

**Files:**
- Modify: `backend/src/services/kline.service.test.ts`
- Modify: `backend/src/services/websocket.service.ts`
- Modify: `backend/src/database/postgres.ts`

**Step 1: Write the failing tests**

- Add a test that verifies successful realtime persistence updates `latest_open_time` and `last_realtime_sync_at`.
- Add a test that verifies realtime persistence failure records `last_realtime_error`.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/services/kline.service.test.ts`
Expected: FAIL because realtime sync-state is not updated yet.

**Step 3: Implement minimal production code**

- Update the realtime persistence path in `WebSocketService.broadcastKline()` or delegated service helper to write realtime sync-state.
- Keep realtime websocket payload behavior unchanged.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/services/kline.service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/websocket.service.ts backend/src/services/kline.service.test.ts backend/src/database/postgres.ts
git commit -m "feat: 记录实时 K 线同步状态"
```

### Task 6: Add a lightweight server verification path

**Files:**
- Modify: `backend/src/database/postgres.ts`
- Optional Modify: `backend/src/server.ts`

**Step 1: Implement minimal read helpers**

- Add read methods needed for operational verification, such as:
  - list kline sync states
  - list symbol sync states

These can remain internal helpers if no public API is needed.

**Step 2: Run focused tests**

Run: `npm test -- --run src/database/postgres.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add backend/src/database/postgres.ts backend/src/database/postgres.test.ts
git commit -m "chore: 补充同步状态读取能力"
```

### Task 7: Run full verification

**Files:**
- Test: `backend/src/**/*.test.ts`

**Step 1: Run full backend tests**

Run: `npm test -- --run`
Expected: PASS

**Step 2: Run build**

Run: `npm run build`
Expected: PASS

### Task 8: Deploy and verify on the server

**Files:**
- Server-local PostgreSQL schema
- Server-local PM2 process

**Step 1: Pull and rebuild**

Run on server:

```bash
cd /root/apps/quant-trading-system
git pull --ff-only origin master
cd backend
npm run build
```

Expected: Latest backend builds successfully.

**Step 2: Run migration/backfill path**

Run on server:

```bash
cd /root/apps/quant-trading-system/backend
npm run migrate:sqlite-to-postgres
```

Expected: Migration script completes and sync-state rows are backfilled.

**Step 3: Restart backend**

Run on server:

```bash
cd /root/apps/quant-trading-system
pm2 restart backend/ecosystem.config.cjs --only quant-backend --update-env
pm2 save
```

Expected: `quant-backend` returns online.

**Step 4: Verify runtime**

Run on server:

```bash
curl http://127.0.0.1:4000/api/health
curl "http://127.0.0.1:4000/api/klines?exchange=binance&symbol=BTCUSDT&interval=1h&limit=5"
```

And inspect PostgreSQL:

```bash
psql -h localhost -U quant_user -d quant_trading -c "select * from kline_sync_state limit 5"
psql -h localhost -U quant_user -d quant_trading -c "select * from symbol_sync_state limit 5"
```

Expected: APIs stay healthy and both sync-state tables contain rows.
