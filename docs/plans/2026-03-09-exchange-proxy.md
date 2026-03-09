# Exchange Proxy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Route exchange REST and WebSocket traffic through the local proxy and disable synthetic demo kline fallback by default.

**Architecture:** Add a small backend proxy utility that resolves the proxy URL from env or a local default. Use it from both Axios and `ws`, and change kline fallback logic so cached data is allowed but synthetic candles are no longer returned by default.

**Tech Stack:** TypeScript, Axios, ws, Vitest, Node proxy agents

---

### Task 1: Add failing backend tests

**Files:**
- Modify: `D:\xp\quant-trading-system\backend\src\services\kline.service.test.ts`
- Create: `D:\xp\quant-trading-system\backend\src\network\proxy.test.ts`

**Step 1: Write the failing test**

Add tests for:
- resolving default proxy URL when env vars are unset
- preferring `HTTPS_PROXY` over the local default
- returning empty cached result instead of demo data when remote fetch fails and demo fallback is disabled

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/network/proxy.test.ts src/services/kline.service.test.ts`

Expected: FAIL because the proxy helper does not exist and kline fallback still returns demo data.

### Task 2: Implement proxy helper and transport wiring

**Files:**
- Create: `D:\xp\quant-trading-system\backend\src\network\proxy.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\exchanges\binance.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\exchanges\okx.ts`
- Modify: `D:\xp\quant-trading-system\backend\package.json`

**Step 1: Write minimal implementation**

Create a helper that:
- resolves proxy URL from `HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY`
- falls back to `http://127.0.0.1:7890`
- builds an agent usable by Axios and `ws`

Wire both exchanges to use that transport for REST and WebSocket.

**Step 2: Run test to verify it passes**

Run: `npm test -- --run src/network/proxy.test.ts`

Expected: PASS

### Task 3: Disable demo fallback by default

**Files:**
- Modify: `D:\xp\quant-trading-system\backend\src\services\kline.service.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\types\index.ts`
- Modify: `D:\xp\quant-trading-system\backend\src\server.ts`

**Step 1: Write minimal implementation**

Change fallback order to:
- remote data when available
- cached data when available
- empty result otherwise

Leave room for a future opt-in synthetic mode, but do not enable it by default.

**Step 2: Run test to verify it passes**

Run: `npm test -- --run src/services/kline.service.test.ts`

Expected: PASS

### Task 4: Verify end-to-end behavior

**Files:**
- No new files required

**Step 1: Run verification**

Run:
- `npm test -- --run`
- `npm run build`
- `Invoke-WebRequest http://localhost:4000/api/klines?exchange=binance&symbol=BTCUSDT&interval=1h&limit=5`

Expected:
- tests pass
- build passes
- API returns real or cached data if the proxy is working, otherwise empty data instead of demo data
