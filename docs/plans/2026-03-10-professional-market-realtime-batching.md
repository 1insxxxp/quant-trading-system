# Professional Market Realtime Batching Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split realtime market updates into a 200ms latest-price lane and a separately batched candle lane, while decoupling database writes from UI push cadence.

**Architecture:** Reuse the current per-market trade subscription model, but enrich the in-memory market stream so it tracks both dirty latest-price state and dirty interval candles. Emit `price` and `kline` websocket messages in 200ms batches, persist closed candles immediately, and persist active candles only through low-frequency checkpoints.

**Tech Stack:** TypeScript, Express, ws, PostgreSQL, React, Zustand, lightweight-charts, Vitest

---

### Task 1: Lock the new realtime contract with failing backend tests

**Files:**
- Modify: `D:\xp\quant-trading-system\backend\src\services\trade-aggregator.test.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\market-trade-stream.test.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\types\index.ts`

**Step 1: Write the failing test**

Add tests that prove:
- a trade updates a dirty latest-price snapshot independently from candle state
- a 200ms flush emits a `price` payload when only price changed
- an interval rollover emits a closed candle and starts a new active candle
- display flush does not imply persistence of every in-progress candle

**Step 2: Run test to verify it fails**

Run:
```bash
cd /d D:\xp\quant-trading-system\backend
npm test -- --run src/services/trade-aggregator.test.ts src/services/market-trade-stream.test.ts
```

Expected:
- at least one new assertion fails because the current implementation only emits batched `kline` updates on a 1000ms timer

**Step 3: Commit**

Do not commit yet. Move directly to Task 2 once the failure is correct.

### Task 2: Add explicit price state to the backend realtime model

**Files:**
- Modify: `D:\xp\quant-trading-system\backend\src\types\index.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\trade-aggregator.ts`

**Step 1: Write minimal implementation**

Add the minimal backend types and state needed for the new contract:
- a websocket `price` payload shape
- aggregator state for:
  - `latestPrice`
  - `latestTradeTimestamp`
  - `priceDirty`
- aggregator methods that separately consume:
  - dirty price updates
  - dirty candle updates

Keep the current interval aggregation semantics unchanged except for separating price dirtiness from candle dirtiness.

**Step 2: Run test to verify it passes**

Run:
```bash
cd /d D:\xp\quant-trading-system\backend
npm test -- --run src/services/trade-aggregator.test.ts
```

Expected:
- the new aggregator contract tests pass

**Step 3: Commit**

```bash
git add D:\xp\quant-trading-system\backend\src\types\index.ts D:\xp\quant-trading-system\backend\src\services\trade-aggregator.ts D:\xp\quant-trading-system\backend\src\services\trade-aggregator.test.ts
git commit -m "feat: separate realtime price and candle aggregation"
```

### Task 3: Replace the 1-second stream flush with 200ms batched display pushes

**Files:**
- Modify: `D:\xp\quant-trading-system\backend\src\services\market-trade-stream.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\market-trade-stream.test.ts`

**Step 1: Write the failing test**

Add stream-level tests for:
- `price` emits at the 200ms display cadence
- `kline` emits at the same cadence only when candle data changed
- no emit occurs when no new trade arrived since the last flush

**Step 2: Run test to verify it fails**

Run:
```bash
cd /d D:\xp\quant-trading-system\backend
npm test -- --run src/services/market-trade-stream.test.ts
```

Expected:
- failure because the stream still uses one `onEmit(kline)` pathway on a 1000ms interval

**Step 3: Write minimal implementation**

Refactor `MarketTradeStream` so it:
- uses a `200ms` display timer
- emits dirty price updates through `onEmitPrice`
- emits dirty candles through `onEmitKline`
- keeps the upstream market subscription count unchanged

Do not introduce persistence behavior here yet.

**Step 4: Run test to verify it passes**

Run:
```bash
cd /d D:\xp\quant-trading-system\backend
npm test -- --run src/services/market-trade-stream.test.ts
```

Expected:
- display batching tests pass

**Step 5: Commit**

```bash
git add D:\xp\quant-trading-system\backend\src\services\market-trade-stream.ts D:\xp\quant-trading-system\backend\src\services\market-trade-stream.test.ts
git commit -m "feat: batch realtime market display updates at 200ms"
```

### Task 4: Decouple realtime persistence from display flush cadence

**Files:**
- Modify: `D:\xp\quant-trading-system\backend\src\services\websocket.service.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\kline.service.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\sync-state.service.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\market-trade-stream.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\market-trade-stream.test.ts`

**Step 1: Write the failing test**

Add focused tests that prove:
- closed candles are persisted immediately on rollover
- active candles are checkpointed on a lower-frequency timer, not every 200ms display flush
- websocket broadcast still happens even if persistence fails

**Step 2: Run test to verify it fails**

Run:
```bash
cd /d D:\xp\quant-trading-system\backend
npm test -- --run src/services/market-trade-stream.test.ts src/services/kline.service.test.ts
```

Expected:
- failure because the current websocket service persists each realtime candle broadcast

**Step 3: Write minimal implementation**

Implement:
- immediate persistence for rolled-over closed candles
- a low-frequency checkpoint path for current open candles, for example every 5 seconds
- sync-state recording for both realtime success and realtime failure without blocking UI push
- websocket broadcasting for both `price` and `kline` message types

**Step 4: Run test to verify it passes**

Run:
```bash
cd /d D:\xp\quant-trading-system\backend
npm test -- --run src/services/market-trade-stream.test.ts src/services/kline.service.test.ts src/services/sync-state.service.test.ts
```

Expected:
- all targeted persistence and sync-state tests pass

**Step 5: Commit**

```bash
git add D:\xp\quant-trading-system\backend\src\services\websocket.service.ts D:\xp\quant-trading-system\backend\src\services\kline.service.ts D:\xp\quant-trading-system\backend\src\services\sync-state.service.ts D:\xp\quant-trading-system\backend\src\services\market-trade-stream.ts D:\xp\quant-trading-system\backend\src\services\market-trade-stream.test.ts
git commit -m "refactor: decouple realtime persistence from display batching"
```

### Task 5: Teach the frontend websocket client to consume split price and candle messages

**Files:**
- Modify: `D:\xp\quant-trading-system\frontend\src\lib\marketSocket.ts`
- Modify: `D:\xp\quant-trading-system\frontend\src\lib\marketSocket.test.ts`
- Modify: `D:\xp\quant-trading-system\frontend\src\hooks\useWebSocket.ts`
- Modify: `D:\xp\quant-trading-system\frontend\src\stores\marketStore.ts`
- Modify: `D:\xp\quant-trading-system\frontend\src\stores\marketStore.test.ts`
- Modify: `D:\xp\quant-trading-system\frontend\src\types\index.ts`

**Step 1: Write the failing test**

Add tests that prove:
- websocket `price` messages update `latestPrice` without mutating `klines`
- websocket `kline` messages still only replace the last candle or append a new one
- stale messages from a previous market key are ignored

**Step 2: Run test to verify it fails**

Run:
```bash
cd /d D:\xp\quant-trading-system\frontend
npm test -- --run src/lib/marketSocket.test.ts src/stores/marketStore.test.ts
```

Expected:
- failure because the frontend does not yet distinguish `price` messages from `kline` messages

**Step 3: Write minimal implementation**

Update the frontend so:
- websocket `price` messages call `setLatestPrice`
- websocket `kline` messages keep using `updateKline`
- store logic remains append-or-replace only
- the active market key guard stays in place

**Step 4: Run test to verify it passes**

Run:
```bash
cd /d D:\xp\quant-trading-system\frontend
npm test -- --run src/lib/marketSocket.test.ts src/stores/marketStore.test.ts
```

Expected:
- frontend message-routing tests pass

**Step 5: Commit**

```bash
git add D:\xp\quant-trading-system\frontend\src\lib\marketSocket.ts D:\xp\quant-trading-system\frontend\src\lib\marketSocket.test.ts D:\xp\quant-trading-system\frontend\src\hooks\useWebSocket.ts D:\xp\quant-trading-system\frontend\src\stores\marketStore.ts D:\xp\quant-trading-system\frontend\src\stores\marketStore.test.ts D:\xp\quant-trading-system\frontend\src\types\index.ts
git commit -m "feat: split frontend realtime price and candle handling"
```

### Task 6: Verify price animation and chart behavior still feel correct

**Files:**
- Modify: `D:\xp\quant-trading-system\frontend\src\components\PriceBoard.tsx`
- Modify: `D:\xp\quant-trading-system\frontend\src\components\KlineChart.tsx`
- Modify: `D:\xp\quant-trading-system\frontend\src\components\KlineChart.test.tsx`
- Modify: `D:\xp\quant-trading-system\frontend\src\lib\marketDisplay.test.ts`

**Step 1: Write the failing test**

Add tests or assertions for:
- frequent latest-price updates do not require full chart data replacement
- the current price panel still animates from old to new values
- the chart update helper still prefers update-last or append for realtime candles

**Step 2: Run test to verify it fails**

Run:
```bash
cd /d D:\xp\quant-trading-system\frontend
npm test -- --run src/components/KlineChart.test.tsx src/lib/marketDisplay.test.ts
```

Expected:
- failure if any assumption about old 1-second coupling is still baked into the UI

**Step 3: Write minimal implementation**

Keep the UI conservative:
- no full-history redraw for realtime updates
- no extra animation beyond the existing price roll
- no chart-wide repaint tied to every price message

**Step 4: Run test to verify it passes**

Run:
```bash
cd /d D:\xp\quant-trading-system\frontend
npm test -- --run src/components/KlineChart.test.tsx src/lib/marketDisplay.test.ts
```

Expected:
- the chart and price animation tests pass

**Step 5: Commit**

```bash
git add D:\xp\quant-trading-system\frontend\src\components\PriceBoard.tsx D:\xp\quant-trading-system\frontend\src\components\KlineChart.tsx D:\xp\quant-trading-system\frontend\src\components\KlineChart.test.tsx D:\xp\quant-trading-system\frontend\src\lib\marketDisplay.test.ts
git commit -m "fix: preserve chart stability under batched realtime updates"
```

### Task 7: Run full verification and document operational expectations

**Files:**
- Modify: `D:\xp\quant-trading-system\docs\plans\2026-03-10-professional-market-realtime-batching-design.md`
- Modify: `D:\xp\quant-trading-system\docs\plans\2026-03-10-professional-market-realtime-batching.md`

**Step 1: Run backend verification**

Run:
```bash
cd /d D:\xp\quant-trading-system\backend
npm test -- --run
npm run build
```

Expected:
- all backend tests pass
- build succeeds

**Step 2: Run frontend verification**

Run:
```bash
cd /d D:\xp\quant-trading-system\frontend
npm test -- --run
npm run build
```

Expected:
- all frontend tests pass
- build succeeds

**Step 3: Manual runtime verification**

Run the local stack and verify:
- latest price updates roughly every 200ms during active trading
- the chart updates only when the active candle changes
- switching exchange, symbol, and interval still works
- historical paging still works after the realtime path changes

**Step 4: Commit**

```bash
git add D:\xp\quant-trading-system\docs\plans\2026-03-10-professional-market-realtime-batching-design.md D:\xp\quant-trading-system\docs\plans\2026-03-10-professional-market-realtime-batching.md
git commit -m "docs: finalize professional realtime batching rollout notes"
```
