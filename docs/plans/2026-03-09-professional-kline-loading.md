# Professional Kline Loading Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Load historical klines in professional paging mode with a 2000-bar initial window, 1000-bar backward pagination, and incremental realtime updates.

**Architecture:** Extend the backend `/api/klines` path to support `before`-based historical pagination and loop upstream requests when a single exchange request cannot satisfy the requested bar count. On the frontend, split initial and older-history loading, add left-edge auto-pagination in the chart, and keep websocket updates incremental.

**Tech Stack:** TypeScript, Express, SQLite, React, Zustand, lightweight-charts, Vitest

---

### Task 1: Add backend tests for paged historical loading

**Files:**
- Modify: `backend/src/services/kline.service.test.ts`
- Modify: `backend/src/database/sqlite.ts`
- Modify: `backend/src/services/kline.service.ts`

**Step 1: Write the failing tests**

- Add a service test showing that when local cache is insufficient, the service loops upstream pages until the requested count is met.
- Add a service test for `before` pagination returning older bars only.

**Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/services/kline.service.test.ts`
Expected: FAIL because the service only fetches one upstream page and does not support `before`.

**Step 3: Write the minimal implementation**

- Extend DB query helpers to support latest-page and before-page lookups.
- Extend the service to normalize, merge, and backfill across multiple upstream requests.

**Step 4: Run the test to verify it passes**

Run: `npm test -- --run src/services/kline.service.test.ts`
Expected: PASS

### Task 2: Extend exchange adapters for historical pagination

**Files:**
- Modify: `backend/src/exchanges/binance.ts`
- Modify: `backend/src/exchanges/okx.ts`
- Modify: `backend/src/types/index.ts`

**Step 1: Write the failing tests**

- Add adapter-level or service-level tests that require more than one upstream page.
- Verify Binance and OKX history can be fetched backward from a cursor.

**Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/services/kline.service.test.ts`
Expected: FAIL because adapters do not accept backward cursors.

**Step 3: Write the minimal implementation**

- Add optional cursor params to adapter history methods.
- Binance: use time-bounded klines paging.
- OKX: use the exchange historical endpoint / cursor for older bars.

**Step 4: Run the test to verify it passes**

Run: `npm test -- --run src/services/kline.service.test.ts`
Expected: PASS

### Task 3: Update the HTTP API and initial-load contract

**Files:**
- Modify: `backend/src/server.ts`
- Modify: `frontend/src/stores/marketStore.ts`
- Modify: `frontend/src/stores/marketStore.test.ts`

**Step 1: Write the failing frontend tests**

- Add a test that initial historical loading requests `2000` bars.
- Add a test that older-history loading requests bars before the current earliest timestamp.

**Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/stores/marketStore.test.ts`
Expected: FAIL because the store still uses a fixed `limit=1000` fetch path and has no older-history action.

**Step 3: Write the minimal implementation**

- Replace `fetchKlines` with explicit initial / older history actions.
- Add loading and has-more flags.
- Change the server endpoint to accept `before`.

**Step 4: Run the test to verify it passes**

Run: `npm test -- --run src/stores/marketStore.test.ts`
Expected: PASS

### Task 4: Add chart-triggered historical pagination

**Files:**
- Modify: `frontend/src/components/KlineChart.tsx`
- Modify: `frontend/src/components/klineChartData.ts`
- Modify: `frontend/src/components/klineChartData.test.ts`

**Step 1: Write the failing test**

- Add a helper test for the left-edge loading trigger / update strategy.
- Verify market switches still force replace while realtime updates remain incremental.

**Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/components/klineChartData.test.ts`
Expected: FAIL because no historical-edge trigger helper exists for the chart flow.

**Step 3: Write the minimal implementation**

- Add visible-range edge detection.
- Call `loadOlderKlines` when the user scrolls near the earliest loaded bar.
- Keep websocket updates incremental.

**Step 4: Run the test to verify it passes**

Run: `npm test -- --run src/components/klineChartData.test.ts`
Expected: PASS

### Task 5: Final verification

**Files:**
- Modify: `backend/src/server.ts`
- Modify: `backend/src/services/kline.service.ts`
- Modify: `backend/src/database/sqlite.ts`
- Modify: `backend/src/exchanges/binance.ts`
- Modify: `backend/src/exchanges/okx.ts`
- Modify: `backend/src/types/index.ts`
- Modify: `frontend/src/stores/marketStore.ts`
- Modify: `frontend/src/stores/marketStore.test.ts`
- Modify: `frontend/src/components/KlineChart.tsx`
- Modify: `frontend/src/components/klineChartData.ts`
- Modify: `frontend/src/components/klineChartData.test.ts`

**Step 1: Run backend verification**

Run: `npm test -- --run src/services/kline.service.test.ts`
Expected: PASS

**Step 2: Run frontend verification**

Run: `npm test -- --run src/stores/marketStore.test.ts src/stores/marketStore.persistence.test.ts src/lib/marketDisplay.test.ts src/components/klineChartData.test.ts src/stores/uiStore.test.ts src/components/SystemTopbar.test.tsx`
Expected: PASS

**Step 3: Run builds**

Run: `npm run build`
Expected: PASS in `backend`

Run: `npm run build`
Expected: PASS in `frontend`
