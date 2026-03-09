# Realtime Trade Aggregation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the live candle every second by aggregating exchange trade streams for all supported intervals.

**Architecture:** Add a backend trade aggregation layer that maintains one upstream trade subscription per market and multiple in-memory interval candles per active subscription. Reuse the existing WebSocket message format so the frontend keeps receiving `kline` events.

**Tech Stack:** TypeScript, ws, Vitest, Express, SQLite

---

### Task 1: Add failing aggregation tests

**Files:**
- Create: `D:\xp\quant-trading-system\backend\src\services\trade-aggregator.test.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\types\index.ts`

**Step 1: Write the failing test**

Add tests for:
- grouping trades into the correct interval bucket
- rolling over to a new candle on interval boundaries
- emitting the current in-progress candle once per second

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/services/trade-aggregator.test.ts`

Expected: FAIL because the aggregator does not exist.

### Task 2: Implement trade aggregation

**Files:**
- Create: `D:\xp\quant-trading-system\backend\src\services\trade-aggregator.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\types\index.ts`

**Step 1: Write minimal implementation**

Create:
- a `TradeTick` type
- interval-to-milliseconds mapping
- an aggregator that updates `open/high/low/close/volume/quote_volume`
- a flush method that returns dirty candles once per second

**Step 2: Run test to verify it passes**

Run: `npm test -- --run src/services/trade-aggregator.test.ts`

Expected: PASS

### Task 3: Wire exchange trade streams into the backend WebSocket service

**Files:**
- Modify: `D:\xp\quant-trading-system\backend\src\exchanges\binance.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\exchanges\okx.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\websocket.service.ts`

**Step 1: Write the failing test**

Add a focused WebSocket-service test or aggregation integration test proving one upstream market stream can feed multiple interval subscriptions.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run <new test path>`

Expected: FAIL because the service still subscribes per-interval to exchange kline streams.

**Step 3: Write minimal implementation**

Change the backend to:
- subscribe once per `exchange + symbol` to trades
- maintain active interval states per subscription key
- flush dirty candles every second
- persist flushed candles through the existing kline service

**Step 4: Run test to verify it passes**

Run: `npm test -- --run <new test path>`

Expected: PASS

### Task 4: Verify end-to-end behavior

**Files:**
- No new files required

**Step 1: Run verification**

Run:
- `npm test -- --run`
- `npm run build`
- backend locally, then observe repeated `kline` messages for the active market roughly every second

Expected:
- all tests pass
- build passes
- the active candle keeps updating once per second while trades are flowing
