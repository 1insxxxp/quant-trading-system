# TradingView Advanced Charts Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current lightweight K-line component with TradingView Advanced Charts while preserving the existing market shell, real-time infrastructure, and exchange/symbol/interval state.

**Architecture:** Keep the current backend market APIs and WebSocket stream as the system of record. Add a client-side TradingView Datafeed adapter in the frontend that maps the existing `/quant/api/klines`, `/quant/api/symbols`, and `/quant/ws` transport into the TradingView widget contract. Keep the current admin shell and topbar, but let TradingView own the chart canvas, toolbars, indicators, drawings, and internal viewport logic.

**Tech Stack:** React, Vite, TypeScript, TradingView Advanced Charts, TradingView Datafeed API, existing Express/WebSocket backend.

---

## Recommended approach

### Option A: Advanced Charts + frontend Datafeed adapter

**Recommendation:** Use this option.

- Reuses the current backend and WebSocket stack.
- Delivers the closest result to TradingView with the smallest backend rewrite.
- Lets the frontend directly implement `resolveSymbol`, `getBars`, `subscribeBars`, and `unsubscribeBars`.
- Keeps the migration reversible because the current shell and state stores stay in place.

### Option B: Advanced Charts + backend UDF route layer

- Faster for a demo because TradingView ships a UDF adapter example.
- Worse fit for this project because UDF is less flexible for real-time streaming and custom subscription behavior.
- Adds a second public API surface that duplicates the current backend routes.

### Option C: Trading Platform full upgrade

- Best long-term choice if chart trading, depth ladder, account manager, and order workflow are required.
- Higher licensing and integration cost.
- Should be a second phase after Advanced Charts is stable.

---

## Constraints and assumptions

- This project will target **TradingView Advanced Charts** first, not Trading Platform.
- The library files will **not** be committed to the public repo.
- The current backend remains the single source for historical bars and real-time updates.
- Exchange universe remains limited to Binance and OKX for this phase.
- Symbol universe remains current spot pairs already exposed by the backend.
- Layout persistence can ship in two stages:
  - Stage 1: local persistence
  - Stage 2: backend user persistence

---

## Delivery phases

### Phase 1: Library access and hosting

**Outcome:** The app can load TradingView library files locally without changing runtime behavior yet.

### Phase 2: Datafeed integration

**Outcome:** Advanced Charts can load symbol metadata, historical bars, and realtime bars from the existing system.

### Phase 3: UI replacement

**Outcome:** The old custom K-line component is replaced by the TradingView chart inside the current shell.

### Phase 4: Persistence and polish

**Outcome:** Chart state, intervals, theme, drawings, and layout behavior feel production-grade.

---

## Task 1: Prepare private TradingView library hosting

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.ts` if present, otherwise Vite public asset flow only
- Modify: `frontend/.gitignore` if needed
- Create: `frontend/public/charting_library/.gitkeep`
- Create: `frontend/src/types/tradingview.d.ts`
- Create: `docs/plans/2026-03-14-tradingview-library-setup-notes.md`

**Step 1: Add a failing smoke test for TradingView loader presence**

- Create a minimal test that expects the chart wrapper to fail clearly when `window.TradingView` is absent.
- Test file: `frontend/src/components/TradingViewChartShell.test.tsx`

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/TradingViewChartShell.test.tsx`

Expected: FAIL because the wrapper does not exist yet.

**Step 3: Add library hosting contract**

- Define a fixed hosting path, for example `/quant/charting_library/`.
- Add `.gitkeep` only; do not commit TradingView files.
- Add `tradingview.d.ts` for `window.TradingView`, widget constructor, and core types used by the wrapper.
- Document the manual install flow and private repository requirement in `docs/plans/2026-03-14-tradingview-library-setup-notes.md`.

**Step 4: Add postinstall or copy script placeholder**

- Prepare `frontend/package.json` scripts for copying TradingView files into `frontend/public/charting_library/`.
- Keep the script disabled or documented if the private repository is not yet available locally.

**Step 5: Run test to verify the wrapper now fails gracefully instead of crashing**

Run: `npx vitest run src/components/TradingViewChartShell.test.tsx`

Expected: PASS with a graceful “library unavailable” state.

**Step 6: Commit**

```bash
git add frontend/package.json frontend/public/charting_library/.gitkeep frontend/src/types/tradingview.d.ts docs/plans/2026-03-14-tradingview-library-setup-notes.md frontend/src/components/TradingViewChartShell.test.tsx
git commit -m "chore: prepare tradingview library hosting contract"
```

---

## Task 2: Build a TradingView Datafeed adapter on top of existing backend APIs

**Files:**
- Create: `frontend/src/tradingview/datafeed/createDatafeed.ts`
- Create: `frontend/src/tradingview/datafeed/resolution.ts`
- Create: `frontend/src/tradingview/datafeed/symbols.ts`
- Create: `frontend/src/tradingview/datafeed/history.ts`
- Create: `frontend/src/tradingview/datafeed/realtime.ts`
- Create: `frontend/src/tradingview/datafeed/types.ts`
- Test: `frontend/src/tradingview/datafeed/createDatafeed.test.ts`
- Test: `frontend/src/tradingview/datafeed/history.test.ts`
- Test: `frontend/src/tradingview/datafeed/realtime.test.ts`

**Step 1: Write failing tests for symbol resolution**

- Test `onReady`
- Test `searchSymbols`
- Test `resolveSymbol`
- Verify mapping from:
  - `binance + ETHUSDT` -> `BINANCE:ETHUSDT`
  - `okx + BTCUSDT` -> `OKX:BTCUSDT`

**Step 2: Run tests to verify failure**

Run: `npx vitest run src/tradingview/datafeed/createDatafeed.test.ts`

Expected: FAIL because adapter does not exist yet.

**Step 3: Implement symbol layer**

- Fetch symbols from `/quant/api/symbols?exchange=<exchange>&type=spot`
- Return TradingView `LibrarySymbolInfo`
- Use:
  - `session: '24x7'`
  - `timezone: 'Etc/UTC'`
  - `data_status: 'streaming'`
  - supported resolutions mapped from current product scope

**Step 4: Write failing tests for history loading**

- Test ascending bar order.
- Test countBack top-up behavior.
- Test `noData` behavior.
- Test resolution mapping:
  - `1` -> `1m`
  - `5` -> `5m`
  - `15` -> `15m`
  - `60` -> `1h`
  - `240` -> `4h`
  - `1D` -> `1d`

**Step 5: Run tests to verify failure**

Run: `npx vitest run src/tradingview/datafeed/history.test.ts`

Expected: FAIL because `getBars` is not implemented.

**Step 6: Implement history adapter**

- Map TradingView `periodParams.countBack` into repeated calls to `/quant/api/klines`
- Always return bars in ascending chronological order
- Keep loading earlier pages until:
  - requested count is satisfied
  - backend reports `hasMore: false`
  - or no older bars are returned
- Convert timestamps to TradingView bar format in milliseconds

**Step 7: Write failing tests for realtime**

- Test that `subscribeBars` updates only the most recent bar or appends a new bar.
- Test multiple concurrent subscribers for different resolutions.
- Test unsubscribe cleanup.

**Step 8: Run tests to verify failure**

Run: `npx vitest run src/tradingview/datafeed/realtime.test.ts`

Expected: FAIL because realtime bridge is not implemented.

**Step 9: Implement realtime bridge**

- Reuse the current WebSocket backend endpoint `ws://.../quant/ws`
- Maintain subscriber registry keyed by TradingView `listenerGuid`
- Route messages by symbol and resolution independently
- Never broadcast mismatched bars to the wrong subscriber

**Step 10: Run adapter tests**

Run: `npx vitest run src/tradingview/datafeed/createDatafeed.test.ts src/tradingview/datafeed/history.test.ts src/tradingview/datafeed/realtime.test.ts`

Expected: PASS

**Step 11: Commit**

```bash
git add frontend/src/tradingview/datafeed
git commit -m "feat: add tradingview datafeed adapter"
```

---

## Task 3: Add a React wrapper for TradingView Advanced Charts

**Files:**
- Create: `frontend/src/components/TradingViewChartShell.tsx`
- Create: `frontend/src/components/TradingViewChartShell.test.tsx`
- Create: `frontend/src/lib/tradingviewWidgetOptions.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/KlineChart.tsx`

**Step 1: Write a failing wrapper smoke test**

- Test mounting with mocked `window.TradingView`
- Test unmount cleanup destroys widget
- Test symbol/interval prop change updates widget rather than remounting the whole page

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/TradingViewChartShell.test.tsx`

Expected: FAIL

**Step 3: Implement wrapper**

- Create chart container ref
- Construct `new TradingView.widget(...)`
- Inject:
  - `container`
  - `library_path`
  - `datafeed`
  - `symbol`
  - `interval`
  - `theme`
  - `locale: 'zh'`
- Destroy widget on unmount

**Step 4: Integrate wrapper into current screen**

- Keep the current page shell in `App.tsx`
- Replace the custom chart canvas inside `KlineChart.tsx`
- Keep `SystemTopbar.tsx` as the source of exchange and symbol selection
- Keep current `uiStore` theme as the source for dark/light mode

**Step 5: Run wrapper tests**

Run: `npx vitest run src/components/TradingViewChartShell.test.tsx src/components/KlineChart.test.tsx`

Expected: PASS

**Step 6: Commit**

```bash
git add frontend/src/components/TradingViewChartShell.tsx frontend/src/components/TradingViewChartShell.test.tsx frontend/src/lib/tradingviewWidgetOptions.ts frontend/src/App.tsx frontend/src/components/KlineChart.tsx
git commit -m "feat: embed tradingview advanced chart shell"
```

---

## Task 4: Synchronize TradingView with current product state

**Files:**
- Modify: `frontend/src/components/SystemTopbar.tsx`
- Modify: `frontend/src/stores/marketStore.ts`
- Modify: `frontend/src/hooks/useWebSocket.ts`
- Modify: `frontend/src/components/Toolbar.tsx`
- Test: `frontend/src/components/SystemTopbar.test.tsx`
- Test: `frontend/src/stores/marketStore.test.ts`

**Step 1: Write failing sync tests**

- Changing exchange in topbar updates TradingView symbol universe.
- Changing symbol updates chart without dropping active session UI.
- Changing interval updates chart resolution.
- Fallback latest price still updates topbar when chart is active.

**Step 2: Run tests to verify failure**

Run: `npx vitest run src/components/SystemTopbar.test.tsx src/stores/marketStore.test.ts`

Expected: FAIL for new sync scenarios.

**Step 3: Implement state contract**

- Keep `marketStore` as source of truth for:
  - active exchange
  - active symbol
  - active interval
  - latest price shown in topbar
- Stop using `marketStore.klines` as the main rendered chart source once TradingView is active
- Retain `marketStore.klines` only if needed for auxiliary UI and fallback diagnostics

**Step 4: Reduce duplicate realtime pathways**

- Let TradingView datafeed own chart bar updates
- Keep `useWebSocket.ts` only for topbar price state and health monitoring, or merge it into the TradingView realtime adapter if cleaner
- Avoid dual subscriptions that update both old chart code and TradingView simultaneously

**Step 5: Run tests**

Run: `npx vitest run src/components/SystemTopbar.test.tsx src/stores/marketStore.test.ts`

Expected: PASS

**Step 6: Commit**

```bash
git add frontend/src/components/SystemTopbar.tsx frontend/src/stores/marketStore.ts frontend/src/hooks/useWebSocket.ts frontend/src/components/Toolbar.tsx
git commit -m "refactor: sync tradingview chart with market store"
```

---

## Task 5: Add TradingView-specific customization and Chinese terminal polish

**Files:**
- Create: `frontend/src/tradingview/customization/features.ts`
- Create: `frontend/src/tradingview/customization/theme.ts`
- Modify: `frontend/src/components/KlineChart.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Write a failing integration smoke test for widget options**

- Verify Chinese locale
- Verify disabled features list
- Verify enabled storage/layout features where configured
- Verify theme mapping to current dark/light system

**Step 2: Run test to verify failure**

Run: `npx vitest run src/components/TradingViewChartShell.test.tsx`

Expected: FAIL for missing widget options.

**Step 3: Implement customization**

- Use Chinese locale
- Align theme with current dark/light palette
- Disable duplicate controls that clash with existing shell
- Keep core TV tools:
  - indicators
  - drawing tools
  - crosshair
  - compare
  - screenshot if desired

**Step 4: Run tests**

Run: `npx vitest run src/components/TradingViewChartShell.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/tradingview/customization frontend/src/components/KlineChart.tsx frontend/src/index.css
git commit -m "style: customize tradingview chart for quant terminal shell"
```

---

## Task 6: Persist layouts, drawings, and selected chart state

**Files:**
- Create: `frontend/src/tradingview/persistence/layoutStorage.ts`
- Create: `frontend/src/tradingview/persistence/layoutStorage.test.ts`
- Optional backend phase:
  - Create: `backend/src/services/chart-layout.service.ts`
  - Modify: `backend/src/server.ts`
  - Test: `backend/src/services/chart-layout.service.test.ts`

**Step 1: Write failing tests for local layout persistence**

- Save last symbol
- Save last resolution
- Save chart layout blob
- Restore on refresh

**Step 2: Run test to verify failure**

Run: `npx vitest run src/tradingview/persistence/layoutStorage.test.ts`

Expected: FAIL

**Step 3: Implement Stage 1 local persistence**

- Persist chart layout and active symbol/resolution in browser storage
- Restore on mount only after widget is ready

**Step 4: Optional Stage 2 backend persistence**

- Add authenticated backend endpoints to save/load user layouts
- Use this only once auth/user identity exists

**Step 5: Run tests**

Run: `npx vitest run src/tradingview/persistence/layoutStorage.test.ts`

Expected: PASS

**Step 6: Commit**

```bash
git add frontend/src/tradingview/persistence
git commit -m "feat: persist tradingview layout and chart state"
```

---

## Task 7: Retire obsolete lightweight chart code safely

**Files:**
- Modify: `frontend/src/components/KlineChart.tsx`
- Modify: `frontend/src/components/klineChartData.ts`
- Modify: `frontend/src/components/klineChartIndicators.ts`
- Modify: `frontend/src/hooks/useWebSocket.ts`
- Delete only after replacement is fully verified

**Step 1: Write a checklist of still-used lightweight chart helpers**

- Confirm whether any helper is still needed for:
  - topbar price
  - fallback state
  - indicator config dialog

**Step 2: Remove dead code incrementally**

- Keep compatibility shims until the TradingView wrapper is stable
- Delete unused chart-only helpers only after test coverage is updated

**Step 3: Run full frontend test suite**

Run: `npx vitest run`

Expected: PASS

**Step 4: Build frontend**

Run: `npm run build`

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src
git commit -m "refactor: remove obsolete lightweight chart pipeline"
```

---

## Task 8: End-to-end verification

**Files:**
- No new production files unless fixes are needed

**Step 1: Verify library files are served**

Run frontend locally and confirm:
- `/quant/charting_library/charting_library.standalone.js` is reachable
- widget constructor loads without 404

**Step 2: Verify historical bars**

- Open Binance ETH/USDT 1h
- Confirm chart loads deep history, not a single bar
- Confirm scrolling left requests additional history as needed

**Step 3: Verify realtime**

- Confirm the last bar updates in place for the active interval
- Confirm resolution switching does not cause stale subscriber errors

**Step 4: Verify shell integration**

- Exchange switch updates symbol list
- Symbol switch updates chart
- Theme switch updates TradingView theme
- Refresh restores last chart state

**Step 5: Run full verification**

Frontend:
```bash
cd frontend
npx vitest run
npm run build
```

Backend:
```bash
cd backend
npm run build
npx vitest run src/services/kline.service.test.ts src/services/market-trade-stream.test.ts
```

**Step 6: Commit**

```bash
git add .
git commit -m "feat: migrate market chart to tradingview advanced charts"
```

---

## External prerequisites

- TradingView access approval for Advanced Charts
- Private GitHub access configured for the TradingView repository
- Decision whether this repo remains public; if yes, do not commit any library files
- Clarified licensing/commercial terms if this product is private, internal, or behind login

---

## Notes for our current codebase

- Current chart rendering is centered in `frontend/src/components/KlineChart.tsx`
- Market selection state lives in `frontend/src/stores/marketStore.ts`
- Current realtime transport is `frontend/src/hooks/useWebSocket.ts`
- Existing backend bar API is already close to what the Datafeed adapter needs:
  - `/api/klines`
  - `/api/symbols`
  - `/quant/ws`
- The current lightweight chart viewport bugs are a good reason to let TradingView own chart state entirely once the migration starts

