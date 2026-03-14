# History Auto Pagination Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make historical K-line paging continue automatically while the chart remains pinned to the left edge.

**Architecture:** Keep backend paging as-is and complete the behavior in the chart layer. Add a small left-edge auto-pagination state machine in the chart component, plus testable helpers for edge detection and prepend viewport anchoring. Reuse existing store loading flags to avoid parallel historical requests.

**Tech Stack:** React, Zustand, TypeScript, lightweight-charts, Vitest

---

### Task 1: Add failing tests for left-edge auto-pagination decisions

**Files:**
- Modify: `D:\xp\quant-trading-system\frontend\src\components\klineChartData.test.ts`
- Modify: `D:\xp\quant-trading-system\frontend\src\components\klineChartData.ts`

**Step 1: Write the failing test**

Add tests that cover:
- prepend while edge-pinned should keep the visible range anchored to the left edge
- prepend while not edge-pinned should preserve the current visible bars
- continuous auto-pagination should continue only when still near the left edge and no error is present

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/klineChartData.test.ts`
Expected: FAIL on the new behavior assertions

**Step 3: Write minimal implementation**

Add small pure helpers in `klineChartData.ts` for:
- deciding whether the chart is near the history-loading edge
- resolving the next visible range after prepend depending on edge-pinned mode

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/klineChartData.test.ts`
Expected: PASS

### Task 2: Wire continuous auto-pagination into the chart component

**Files:**
- Modify: `D:\xp\quant-trading-system\frontend\src\components\KlineChart.tsx`
- Test: `D:\xp\quant-trading-system\frontend\src\components\KlineChart.test.tsx`

**Step 1: Write the failing test**

Add or extend tests around chart logic to assert the new helper-driven behavior is used for left-edge historical paging state.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/KlineChart.test.tsx`
Expected: FAIL on the new expectation or helper usage path

**Step 3: Write minimal implementation**

In `KlineChart.tsx`:
- add refs for left-edge pinned state and auto-pagination scheduling
- update visible range subscription to arm/disarm edge-pinned mode
- on prepend, anchor to left edge when edge-pinned, otherwise preserve current range
- after a prepend completes, re-check whether another older page should be loaded
- stop the loop on error, no-more-history, or when the user scrolls away

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/KlineChart.test.tsx`
Expected: PASS

### Task 3: Run focused regression verification

**Files:**
- Verify only

**Step 1: Run component and data tests**

Run: `npx vitest run src/components/klineChartData.test.ts src/components/KlineChart.test.tsx src/stores/marketStore.test.ts`
Expected: PASS

**Step 2: Run frontend build**

Run: `npm run build`
Expected: PASS

**Step 3: Manual smoke check**

Verify in the browser:
- initial load still shows recent history normally
- dragging to the far left triggers more than one historical page automatically
- dragging away from the left edge stops continuous paging
- historical load error still shows retry UI

### Task 4: Replace floating history status with a left-edge indicator

**Files:**
- Modify: `D:\xp\quant-trading-system\frontend\src\components\KlineChart.tsx`
- Modify: `D:\xp\quant-trading-system\frontend\src\components\KlineChart.test.tsx`
- Modify: `D:\xp\quant-trading-system\frontend\src\index.css`

**Step 1: Write the failing test**

Add a component test that expects:
- a left-edge loading indicator container when `isLoadingOlderKlines=true`
- a compact retry affordance when `olderKlineLoadError` exists

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/KlineChart.test.tsx`
Expected: FAIL on the new indicator assertions

**Step 3: Write minimal implementation**

In `KlineChart.tsx` and `index.css`:
- replace the floating loading widget with a narrow left-edge rail
- style the loading state as a vertical signal bar
- style the error state as a small left-edge retry chip

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/KlineChart.test.tsx`
Expected: PASS
