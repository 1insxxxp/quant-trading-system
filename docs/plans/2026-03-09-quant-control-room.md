# Quant Control Room Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the frontend into an institutional quant control room while preserving the current real market chart workflow.

**Architecture:** Keep the existing market store, chart, and toolbar behavior, but wrap them in a new application shell with a left module rail, top system bar, center workspace, right operations rail, and bottom desk tabs. New non-market areas are static but intentionally designed placeholders for future modules.

**Tech Stack:** React, TypeScript, Zustand, lightweight-charts, CSS

---

### Task 1: Build the new application shell

**Files:**
- Modify: `D:\xp\quant-trading-system\frontend\src\App.tsx`
- Create: `D:\xp\quant-trading-system\frontend\src\components\ControlSidebar.tsx`
- Create: `D:\xp\quant-trading-system\frontend\src\components\SystemTopbar.tsx`
- Create: `D:\xp\quant-trading-system\frontend\src\components\OpsRail.tsx`
- Create: `D:\xp\quant-trading-system\frontend\src\components\DeskTabs.tsx`

**Step 1: Add the structural components**

Create a persistent dashboard shell with:
- left navigation
- top system bar
- center market workspace
- right operations rail
- bottom desk tabs

**Step 2: Verify wiring**

Run: `npm run build`
Expected: PASS with the existing market components still mounted in the center workspace.

### Task 2: Refine the market workspace for the new shell

**Files:**
- Modify: `D:\xp\quant-trading-system\frontend\src\components\Toolbar.tsx`
- Modify: `D:\xp\quant-trading-system\frontend\src\components\PriceBoard.tsx`
- Modify: `D:\xp\quant-trading-system\frontend\src\components\KlineChart.tsx`

**Step 1: Adjust component hierarchy and copy**

Make the market workspace feel like the main desk rather than a standalone hero section.

**Step 2: Verify layout**

Run: `npm run build`
Expected: PASS with the chart still rendering and controls still functioning.

### Task 3: Replace the global stylesheet

**Files:**
- Modify: `D:\xp\quant-trading-system\frontend\src\index.css`

**Step 1: Implement the institutional control-room visual system**

Define:
- new tokens
- shell grid
- side rails
- system bar
- market desk panels
- operations cards
- responsive behavior

**Step 2: Verify**

Run: `npm run build`
Expected: PASS with no broken selectors or missing classes.

### Task 4: Final verification

**Files:**
- No new files required

**Step 1: Run verification**

Run:
- `npm test -- --run src/stores/marketStore.test.ts`
- `npm run build`

Expected:
- frontend store behavior remains intact
- the new control-room shell compiles cleanly
