# Frontend Repair Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the current trading dashboard's visible frontend defects so the interface reads correctly, shows truthful market status, and recovers from dropped WebSocket connections.

**Architecture:** Keep the existing React + Zustand structure, but move reconnect behavior into a small testable socket client and move price-display calculations into a pure utility module. Refresh the current dark trading dashboard with a tighter visual system rather than replacing the app structure.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Zustand, lightweight-charts

---

### Task 1: Add Failing Tests For Display And Reconnect Logic

**Files:**
- Create: `frontend/src/lib/marketDisplay.test.ts`
- Create: `frontend/src/lib/marketSocket.test.ts`
- Test: `frontend/src/lib/marketDisplay.test.ts`
- Test: `frontend/src/lib/marketSocket.test.ts`

**Step 1: Write the failing display test**

Cover:
- symbol formatting from `BTCUSDT` to `BTC/USDT`
- price change derived from kline history instead of a fake percentage
- empty-state output when historical data is missing

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/marketDisplay.test.ts`
Expected: FAIL because the utility module does not exist yet.

**Step 3: Write the failing reconnect test**

Cover:
- unexpected socket close schedules a reconnect
- manual disconnect does not reconnect

**Step 4: Run test to verify it fails**

Run: `npm test -- --run src/lib/marketSocket.test.ts`
Expected: FAIL because the reconnect client does not exist yet.

### Task 2: Implement Minimal Frontend Logic Fixes

**Files:**
- Create: `frontend/src/lib/marketDisplay.ts`
- Create: `frontend/src/lib/marketSocket.ts`
- Modify: `frontend/src/hooks/useWebSocket.ts`
- Modify: `frontend/src/components/PriceBoard.tsx`

**Step 1: Write minimal market-display utilities**

Implement:
- `formatMarketSymbol(symbol)`
- `getPriceSnapshot(latestPrice, klines)`

**Step 2: Run display tests**

Run: `npm test -- --run src/lib/marketDisplay.test.ts`
Expected: PASS

**Step 3: Write minimal reconnecting socket client**

Implement a small client that:
- creates a socket
- subscribes on open
- reconnects after unexpected close
- stops reconnecting after cleanup

**Step 4: Run reconnect tests**

Run: `npm test -- --run src/lib/marketSocket.test.ts`
Expected: PASS

### Task 3: Apply The UI Repair And Visual Refresh

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Toolbar.tsx`
- Modify: `frontend/src/components/PriceBoard.tsx`
- Modify: `frontend/src/components/KlineChart.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Replace garbled copy with clear Chinese labels**

Update all visible text in the toolbar, price panel, and chart header.

**Step 2: Refresh the layout**

Apply:
- a more intentional dark-market visual language
- CSS variables for theme consistency
- card-based panels with stronger hierarchy
- responsive spacing for narrow screens

**Step 3: Keep chart behavior intact**

Preserve current kline rendering while improving surrounding panel chrome and empty-state messaging.

### Task 4: Verify The Frontend

**Files:**
- Modify: `frontend/package.json` only if script changes become necessary

**Step 1: Run targeted tests**

Run:
- `npm test -- --run src/lib/marketDisplay.test.ts`
- `npm test -- --run src/lib/marketSocket.test.ts`
- `npm test -- --run`

Expected: PASS

**Step 2: Run production build**

Run: `npm run build`
Expected: PASS

**Step 3: Manual runtime checks**

Verify:
- `http://localhost:5173/quant/` renders the updated dashboard
- the status text is readable
- the displayed change is based on loaded klines or shows a safe fallback
- reconnect occurs after the socket closes unexpectedly
