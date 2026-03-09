# Dynamic Symbol Toolbar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hardcoded symbol dropdown with backend-driven symbol loading while keeping the visible options limited to BTC and ETH pairs.

**Architecture:** Store symbol options in `marketStore`, fetch them from `/quant/api/symbols`, and let the toolbar render that state. The store will own filtering, fallback defaults, and symbol reconciliation so UI components stay simple.

**Tech Stack:** React 18, TypeScript, Zustand, Vite, Vitest

---

### Task 1: Write Failing Store Tests

**Files:**
- Modify: `frontend/src/stores/marketStore.test.ts`
- Test: `frontend/src/stores/marketStore.test.ts`

**Step 1: Write a failing test for symbol loading**

Cover:
- `fetchSymbols` requests `/quant/api/symbols` for the active exchange
- returned symbols are filtered to BTC/ETH

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/stores/marketStore.test.ts`
Expected: FAIL because symbol-loading state and actions do not exist yet.

**Step 3: Write a failing test for symbol reconciliation**

Cover:
- when the active symbol is not in the fetched list, the store switches to the first valid symbol

**Step 4: Run test to verify it fails**

Run: `npm test -- --run src/stores/marketStore.test.ts`
Expected: FAIL with missing state or wrong behavior.

**Step 5: Write a failing test for fallback behavior**

Cover:
- failed symbol fetch restores the default BTC/ETH options

**Step 6: Run test to verify it fails**

Run: `npm test -- --run src/stores/marketStore.test.ts`
Expected: FAIL with missing fallback behavior.

### Task 2: Implement Store Support

**Files:**
- Modify: `frontend/src/stores/marketStore.ts`
- Modify: `frontend/src/types/index.ts`

**Step 1: Add symbol option types and store state**

Add:
- `symbols`
- `isLoadingSymbols`
- `fetchSymbols`

**Step 2: Implement filtering and fallback logic**

Rules:
- accept backend symbols for the current exchange
- keep only BTC/ETH
- preserve current symbol when valid
- replace invalid symbol with the first valid option
- fall back to local defaults if the request fails

**Step 3: Run store tests**

Run: `npm test -- --run src/stores/marketStore.test.ts`
Expected: PASS

### Task 3: Update Toolbar Rendering

**Files:**
- Modify: `frontend/src/components/Toolbar.tsx`

**Step 1: Replace hardcoded symbol options**

Render symbol options from store state.

**Step 2: Add loading and empty-state handling**

Behavior:
- show a loading placeholder while fetching
- keep the selector usable with fallback options
- avoid blank dropdown state

**Step 3: Keep exchange and interval controls unchanged**

Do not expand the feature beyond the approved symbol-loading scope.

### Task 4: Verify The Frontend

**Files:**
- No new files

**Step 1: Run frontend tests**

Run: `npm test -- --run`
Expected: PASS

**Step 2: Run production build**

Run: `npm run build`
Expected: PASS

**Step 3: Manual check**

Verify:
- switching exchanges refreshes the symbol dropdown
- only BTC/ETH pairs appear
- symbol selection remains stable when valid
- fallback list appears if backend symbol loading fails
