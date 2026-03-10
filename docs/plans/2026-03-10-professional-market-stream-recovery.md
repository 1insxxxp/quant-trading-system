# Professional Market Stream Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the market realtime path to a professional terminal-style model with split `price` and `kline` updates, `200ms` display batching, and explicit candle-gap recovery.

**Architecture:** Reuse the current per-market trade subscription model, but replace the minimal aggregator with a richer realtime state that tracks price, active candles, pending closed candles, and gap recovery. Emit `price` and `kline` messages separately, repair missing intervals before resuming normal realtime flow, and decouple storage writes from UI refresh cadence.

**Tech Stack:** TypeScript, Express, ws, PostgreSQL, React, Zustand, lightweight-charts, Vitest

---

### Task 1: Lock the new realtime and recovery contract with failing backend tests

**Files:**
- Modify: `D:\xp\quant-trading-system\backend\src\services\trade-aggregator.test.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\market-trade-stream.test.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\types\index.ts`

**Step 1: Write the failing test**

Add tests that prove:

- trades update a dirty latest-price snapshot independently from candle state
- a `200ms` flush can emit `price` without emitting `kline`
- a gap larger than one interval is detected explicitly
- missing intervals can be recovered or synthesized before normal streaming resumes

**Step 2: Run test to verify it fails**

Run:
```bash
cd /d D:\xp\quant-trading-system\backend
npm test -- --run src/services/trade-aggregator.test.ts src/services/market-trade-stream.test.ts
```

Expected:
- at least one assertion fails because the current implementation only emits `kline` updates on a fixed `1000ms` timer and has no explicit gap recovery state

**Step 3: Commit**

Do not commit yet. Move directly to Task 2 after verifying the failure is the intended one.

### Task 2: Add explicit market realtime state for split price and candle lanes

**Files:**
- Modify: `D:\xp\quant-trading-system\backend\src\types\index.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\trade-aggregator.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\trade-aggregator.test.ts`

**Step 1: Write minimal implementation**

Extend the aggregator contract to track:

- `latestPrice`
- `latestTradeTimestamp`
- `priceDirty`
- per-interval current candle state
- pending closed candles
- gap detection metadata

Add separate consume methods for:

- dirty price state
- dirty candle state

Keep the initial implementation minimal: no exchange backfill yet, only explicit state transitions and gap detection.

**Step 2: Run test to verify it passes**

Run:
```bash
cd /d D:\xp\quant-trading-system\backend
npm test -- --run src/services/trade-aggregator.test.ts
```

Expected:
- new aggregator contract tests pass

**Step 3: Commit**

```bash
git add D:\xp\quant-trading-system\backend\src\types\index.ts D:\xp\quant-trading-system\backend\src\services\trade-aggregator.ts D:\xp\quant-trading-system\backend\src\services\trade-aggregator.test.ts
git commit -m "feat: separate realtime price state from candle aggregation"
```

### Task 3: Replace the 1-second stream flush with 200ms split-lane batching

**Files:**
- Modify: `D:\xp\quant-trading-system\backend\src\services\market-trade-stream.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\market-trade-stream.test.ts`

**Step 1: Write the failing test**

Add stream-level tests that prove:

- `price` emits at `200ms` cadence when price changed
- `kline` emits at `200ms` cadence only when candle data changed
- nothing emits when neither lane is dirty

**Step 2: Run test to verify it fails**

Run:
```bash
cd /d D:\xp\quant-trading-system\backend
npm test -- --run src/services/market-trade-stream.test.ts
```

Expected:
- failure because the current stream still exposes a single `onEmit(kline)` callback on a `1000ms` timer

**Step 3: Write minimal implementation**

Refactor `MarketTradeStream` so it:

- uses a `200ms` display timer
- emits `price` through `onEmitPrice`
- emits `kline` through `onEmitKline`
- preserves the one-upstream-subscription-per-market model

**Step 4: Run test to verify it passes**

Run:
```bash
cd /d D:\xp\quant-trading-system\backend
npm test -- --run src/services/market-trade-stream.test.ts
```

Expected:
- split-lane batching tests pass

**Step 5: Commit**

```bash
git add D:\xp\quant-trading-system\backend\src\services\market-trade-stream.ts D:\xp\quant-trading-system\backend\src\services\market-trade-stream.test.ts
git commit -m "feat: batch realtime price and kline updates every 200ms"
```

### Task 4: Implement candle-gap recovery and synthesized flat-bar repair

**Files:**
- Modify: `D:\xp\quant-trading-system\backend\src\services\market-trade-stream.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\kline.service.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\trade-aggregator.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\market-trade-stream.test.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\kline.service.test.ts`

**Step 1: Write the failing test**

Add tests that prove:

- when trade time jumps across multiple intervals, the stream enters recovery instead of jumping directly to a new current candle
- missing intervals are filled from cached history when possible
- unrecoverable silent intervals are synthesized as zero-volume flat candles

**Step 2: Run test to verify it fails**

Run:
```bash
cd /d D:\xp\quant-trading-system\backend
npm test -- --run src/services/market-trade-stream.test.ts src/services/kline.service.test.ts
```

Expected:
- failure because the current stream does not explicitly backfill or synthesize missing intervals

**Step 3: Write minimal implementation**

Implement recovery logic that:

- detects gaps larger than one interval
- queries PostgreSQL first for the missing range
- falls back to exchange paging if PostgreSQL is incomplete
- synthesizes flat bars for intervals that still have no real candle
- persists the repaired sequence before resuming normal realtime flow

**Step 4: Run test to verify it passes**

Run:
```bash
cd /d D:\xp\quant-trading-system\backend
npm test -- --run src/services/market-trade-stream.test.ts src/services/kline.service.test.ts
```

Expected:
- gap-recovery tests pass

**Step 5: Commit**

```bash
git add D:\xp\quant-trading-system\backend\src\services\market-trade-stream.ts D:\xp\quant-trading-system\backend\src\services\kline.service.ts D:\xp\quant-trading-system\backend\src\services\trade-aggregator.ts D:\xp\quant-trading-system\backend\src\services\market-trade-stream.test.ts D:\xp\quant-trading-system\backend\src\services\kline.service.test.ts
git commit -m "feat: repair missing realtime candle intervals before broadcast"
```

### Task 5: Decouple persistence cadence from display cadence

**Files:**
- Modify: `D:\xp\quant-trading-system\backend\src\services\websocket.service.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\market-trade-stream.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\sync-state.service.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\services\market-trade-stream.test.ts`

**Step 1: Write the failing test**

Add tests for:

- closed candles persist immediately on rollover
- open candles checkpoint on a lower-frequency timer, for example `5s`
- persistence failure does not block websocket broadcasts

**Step 2: Run test to verify it fails**

Run:
```bash
cd /d D:\xp\quant-trading-system\backend
npm test -- --run src/services/market-trade-stream.test.ts
```

Expected:
- failure because the current websocket layer persists each realtime `kline` broadcast

**Step 3: Write minimal implementation**

Refactor persistence so:

- `price` is never stored
- closed candles persist immediately
- current candles checkpoint on a lower-frequency timer
- sync-state failures are recorded without blocking the UI lane

**Step 4: Run test to verify it passes**

Run:
```bash
cd /d D:\xp\quant-trading-system\backend
npm test -- --run src/services/market-trade-stream.test.ts src/services/sync-state.service.test.ts
```

Expected:
- persistence cadence tests pass

**Step 5: Commit**

```bash
git add D:\xp\quant-trading-system\backend\src\services\websocket.service.ts D:\xp\quant-trading-system\backend\src\services\market-trade-stream.ts D:\xp\quant-trading-system\backend\src\services\sync-state.service.ts D:\xp\quant-trading-system\backend\src\services\market-trade-stream.test.ts
git commit -m "refactor: decouple realtime persistence from display cadence"
```

### Task 6: Teach the frontend to consume split `price` and `kline` messages

**Files:**
- Modify: `D:\xp\quant-trading-system\frontend\src\lib\marketSocket.ts`
- Modify: `D:\xp\quant-trading-system\frontend\src\lib\marketSocket.test.ts`
- Modify: `D:\xp\quant-trading-system\frontend\src\hooks\useWebSocket.ts`
- Modify: `D:\xp\quant-trading-system\frontend\src\stores\marketStore.ts`
- Modify: `D:\xp\quant-trading-system\frontend\src\stores\marketStore.test.ts`
- Modify: `D:\xp\quant-trading-system\frontend\src\types\index.ts`

**Step 1: Write the failing test**

Add tests that prove:

- websocket `price` updates `latestPrice` without touching `klines`
- websocket `kline` updates only the last candle or appends one candle
- stale messages from an old market session are ignored

**Step 2: Run test to verify it fails**

Run:
```bash
cd /d D:\xp\quant-trading-system\frontend
npm test -- --run src/lib/marketSocket.test.ts src/stores/marketStore.test.ts
```

Expected:
- failure because the frontend still derives latest price from `kline.close`

**Step 3: Write minimal implementation**

Update the frontend websocket path so:

- `price` maps to `setLatestPrice`
- `kline` maps to `updateKline`
- no full-history replace is introduced for ordinary realtime updates

**Step 4: Run test to verify it passes**

Run:
```bash
cd /d D:\xp\quant-trading-system\frontend
npm test -- --run src/lib/marketSocket.test.ts src/stores/marketStore.test.ts
```

Expected:
- frontend split-lane message tests pass

**Step 5: Commit**

```bash
git add D:\xp\quant-trading-system\frontend\src\lib\marketSocket.ts D:\xp\quant-trading-system\frontend\src\lib\marketSocket.test.ts D:\xp\quant-trading-system\frontend\src\hooks\useWebSocket.ts D:\xp\quant-trading-system\frontend\src\stores\marketStore.ts D:\xp\quant-trading-system\frontend\src\stores\marketStore.test.ts D:\xp\quant-trading-system\frontend\src\types\index.ts
git commit -m "feat: split frontend price and kline realtime handling"
```

### Task 7: Preserve chart continuity and stable view updates on repaired candles

**Files:**
- Modify: `D:\xp\quant-trading-system\frontend\src\components\klineChartData.ts`
- Modify: `D:\xp\quant-trading-system\frontend\src\components\klineChartData.test.ts`
- Modify: `D:\xp\quant-trading-system\frontend\src\components\KlineChart.tsx`
- Modify: `D:\xp\quant-trading-system\frontend\src\components\KlineChart.test.tsx`

**Step 1: Write the failing test**

Add tests that prove:

- repaired candles can be inserted without forcing a full chart replace
- realtime updates preserve append-or-update semantics for ordinary movement
- the visible range remains stable during repaired-candle insertion

**Step 2: Run test to verify it fails**

Run:
```bash
cd /d D:\xp\quant-trading-system\frontend
npm test -- --run src/components/klineChartData.test.ts src/components/KlineChart.test.tsx
```

Expected:
- failure if the current chart helper cannot distinguish repaired insertion from full replace

**Step 3: Write minimal implementation**

Update the chart helper and chart component so:

- repaired realtime candles keep time ordering
- prepend and insert behaviors preserve the visible range
- ordinary realtime updates still use append or update-last

**Step 4: Run test to verify it passes**

Run:
```bash
cd /d D:\xp\quant-trading-system\frontend
npm test -- --run src/components/klineChartData.test.ts src/components/KlineChart.test.tsx
```

Expected:
- chart continuity tests pass

**Step 5: Commit**

```bash
git add D:\xp\quant-trading-system\frontend\src\components\klineChartData.ts D:\xp\quant-trading-system\frontend\src\components\klineChartData.test.ts D:\xp\quant-trading-system\frontend\src\components\KlineChart.tsx D:\xp\quant-trading-system\frontend\src\components\KlineChart.test.tsx
git commit -m "fix: preserve chart continuity during realtime recovery"
```

### Task 8: Run full verification and capture rollout notes

**Files:**
- Modify: `D:\xp\quant-trading-system\docs\plans\2026-03-10-professional-market-stream-recovery-design.md`
- Modify: `D:\xp\quant-trading-system\docs\plans\2026-03-10-professional-market-stream-recovery.md`

**Step 1: Run backend verification**

Run:
```bash
cd /d D:\xp\quant-trading-system\backend
npm test -- --run
npm run build
```

Expected:
- all backend tests pass
- backend build succeeds

**Step 2: Run frontend verification**

Run:
```bash
cd /d D:\xp\quant-trading-system\frontend
npm test -- --run
npm run build
```

Expected:
- all frontend tests pass
- frontend build succeeds

**Step 3: Manual runtime verification**

Run the local stack and verify:

- latest price updates roughly every `200ms`
- chart candles remain continuous during normal trading and after reconnect
- switching exchange, symbol, and interval still works
- left-scroll historical paging still works with the new realtime path

**Step 4: Commit**

```bash
git add D:\xp\quant-trading-system\docs\plans\2026-03-10-professional-market-stream-recovery-design.md D:\xp\quant-trading-system\docs\plans\2026-03-10-professional-market-stream-recovery.md
git commit -m "docs: finalize professional market stream recovery rollout notes"
```
