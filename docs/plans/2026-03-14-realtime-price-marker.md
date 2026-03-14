# Realtime Price Marker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show a dedicated realtime price marker on the chart's right price scale whenever the viewport is away from the newest candles.

**Architecture:** Keep the existing candlestick series and its default last-price label intact. Add a second manual price line bound to `latestPrice`, and gate its visibility behind a pure helper that decides whether the viewport is detached from realtime.

**Tech Stack:** React 18, Zustand, lightweight-charts 4, Vitest, TypeScript

---

### Task 1: Add failing pure logic tests for realtime marker visibility

**Files:**
- Modify: `frontend/src/components/klineChartData.test.ts`
- Modify: `frontend/src/components/klineChartData.ts`

**Step 1: Write the failing test**

Add tests for:
- show realtime marker when `visibleTo` is well behind the latest logical index
- hide marker when viewport is still near realtime
- hide marker when `latestPrice` is `null`

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/klineChartData.test.ts`

Expected: FAIL because the helper does not exist yet.

**Step 3: Write minimal implementation**

Add a helper that returns whether the detached realtime marker should be visible.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/klineChartData.test.ts`

Expected: PASS

### Task 2: Add realtime price line wiring to KlineChart

**Files:**
- Modify: `frontend/src/components/KlineChart.tsx`
- Modify: `frontend/src/components/KlineChart.test.tsx`

**Step 1: Write the failing test**

Add a small regression test around any extracted helper or component-level behavior used by `KlineChart` so detached realtime state is covered.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/KlineChart.test.tsx src/components/klineChartData.test.ts`

Expected: FAIL on the new detached realtime behavior.

**Step 3: Write minimal implementation**

In `KlineChart.tsx`:
- track a manual realtime `priceLine` ref
- update/remove it when `latestPrice`, theme, market, or visible range changes
- keep the built-in candlestick last-price marker unchanged

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/KlineChart.test.tsx src/components/klineChartData.test.ts`

Expected: PASS

### Task 3: Run focused regression verification

**Files:**
- Test: `frontend/src/components/klineChartData.test.ts`
- Test: `frontend/src/components/KlineChart.test.tsx`
- Test: `frontend/src/stores/marketStore.test.ts`

**Step 1: Run the focused test suite**

Run: `npx vitest run src/components/klineChartData.test.ts src/components/KlineChart.test.tsx src/stores/marketStore.test.ts`

Expected: PASS

**Step 2: Run production build**

Run: `npm run build`

Expected: PASS
