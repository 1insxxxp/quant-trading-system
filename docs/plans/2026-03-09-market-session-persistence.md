# Market Session Persistence And Animated Price Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore the active market selection after a refresh and animate the headline market numbers when they change.

**Architecture:** Add a small `sessionStorage` persistence layer inside the market store for `exchange`, `symbol`, and `interval`. Keep the animation logic isolated in pure display helpers so `PriceBoard` can animate latest price and range change without changing the backend contract.

**Tech Stack:** React, TypeScript, Zustand, Vitest

---

### Task 1: Persist market selection in the current tab

**Files:**
- Modify: `frontend/src/stores/marketStore.ts`
- Test: `frontend/src/stores/marketStore.test.ts`

**Step 1: Write the failing test**

- Add a store test that imports `marketStore` after stubbing `sessionStorage`.
- Verify the initial store restores `exchange`, `symbol`, and `interval` from storage.
- Add a test that verifies `setExchange`, `setSymbol`, and `setInterval` write the updated values back to `sessionStorage`.

**Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/stores/marketStore.test.ts`
Expected: FAIL because the store does not yet read or write market selection to `sessionStorage`.

**Step 3: Write the minimal implementation**

- Add a storage key and a small parser / serializer in `marketStore.ts`.
- Read the persisted selection when the store is created.
- Write the selection back whenever the active market changes.

**Step 4: Run the test to verify it passes**

Run: `npm test -- --run src/stores/marketStore.test.ts`
Expected: PASS

### Task 2: Add animatable numeric helpers

**Files:**
- Modify: `frontend/src/lib/marketDisplay.ts`
- Test: `frontend/src/lib/marketDisplay.test.ts`

**Step 1: Write the failing test**

- Add a helper test for numeric interpolation.
- Verify the helper returns the start value at progress `0`, the target value at progress `1`, and an in-between value for partial progress.

**Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/lib/marketDisplay.test.ts`
Expected: FAIL because the interpolation helper does not exist yet.

**Step 3: Write the minimal implementation**

- Add a small pure helper in `marketDisplay.ts` to interpolate between two numeric values.
- Keep it generic so it can be used by the price board animation logic.

**Step 4: Run the test to verify it passes**

Run: `npm test -- --run src/lib/marketDisplay.test.ts`
Expected: PASS

### Task 3: Animate latest price and range change in the price board

**Files:**
- Modify: `frontend/src/components/PriceBoard.tsx`

**Step 1: Implement the animation layer**

- Add a lightweight React hook inside `PriceBoard.tsx` or a nearby helper file.
- Animate:
  - latest price
  - range change
  - range percent
- Keep loading and empty states unchanged.

**Step 2: Keep formatting stable**

- Preserve the current currency and signed percent formatting.
- Keep rise/fall color logic based on the real target values, not the intermediate frame.

**Step 3: Run verification**

Run: `npm test -- --run src/stores/marketStore.test.ts src/lib/marketDisplay.test.ts src/stores/uiStore.test.ts src/components/SystemTopbar.test.tsx`
Expected: PASS

### Task 4: Final verification

**Files:**
- Modify: `frontend/src/stores/marketStore.ts`
- Modify: `frontend/src/stores/marketStore.test.ts`
- Modify: `frontend/src/components/PriceBoard.tsx`
- Modify: `frontend/src/lib/marketDisplay.ts`
- Create: `frontend/src/lib/marketDisplay.test.ts`

**Step 1: Run the targeted test suite**

Run: `npm test -- --run src/stores/marketStore.test.ts src/lib/marketDisplay.test.ts src/stores/uiStore.test.ts src/components/SystemTopbar.test.tsx`
Expected: PASS

**Step 2: Run the production build**

Run: `npm run build`
Expected: PASS
