# Market Theme Shell Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the market shell into a slimmer backend workspace with a text-only sidebar, compact top-right utility strip, and cyan/blue dual-theme styling without changing market data behavior.

**Architecture:** Keep the current React shell structure and data flow intact, but refactor the persistent chrome and workspace proportions around a stronger design-token layer. Drive the change with component tests for sidebar and topbar structure, then reshape the chart workspace and global CSS tokens while preserving existing store and websocket logic.

**Tech Stack:** React, TypeScript, Zustand, lightweight-charts, CSS, Vitest, Testing Library

---

### Task 1: Lock the new shell structure with failing component tests

**Files:**
- Modify: `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\AdminSidebar.test.tsx`
- Modify: `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\SystemTopbar.test.tsx`

**Step 1: Write the failing test**

Add tests that prove:

- the sidebar no longer renders the large brand-card content
- the sidebar still renders pure text navigation items and their active/planned states
- the topbar still renders the live market readout
- the topbar utility cluster only exposes the compact theme toggle, system clock, and signal status

**Step 2: Run test to verify it fails**

Run:
```bash
cd /d C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend
npm test -- --run src/components/AdminSidebar.test.tsx src/components/SystemTopbar.test.tsx
```

Expected:
- at least one assertion fails because the current sidebar still renders the large brand block and the topbar still uses the heavier status layout

**Step 3: Commit**

Do not commit yet. Move directly to Task 2 after verifying the failure is correct.

### Task 2: Refactor the sidebar into a text-only navigation rail

**Files:**
- Modify: `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\AdminSidebar.tsx`
- Modify: `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\AdminSidebar.test.tsx`

**Step 1: Write minimal implementation**

Refactor `AdminSidebar` so it:

- removes the large `BrandLogo` card and marketing tags
- keeps a compact textual header only
- renders pure text navigation items
- fixes the sidebar Chinese labels

**Step 2: Run test to verify it passes**

Run:
```bash
cd /d C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend
npm test -- --run src/components/AdminSidebar.test.tsx
```

Expected:
- sidebar structure tests pass

**Step 3: Commit**

```bash
git add C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\AdminSidebar.tsx C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\AdminSidebar.test.tsx
git commit -m "refactor: simplify sidebar into text-only navigation"
```

### Task 3: Slim the topbar into a compact utility strip

**Files:**
- Modify: `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\SystemTopbar.tsx`
- Modify: `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\SystemTopbar.test.tsx`

**Step 1: Write minimal implementation**

Refactor `SystemTopbar` so it:

- keeps the sidebar toggle, live price, and `symbol + exchange` on the left
- compresses the right side into a small utility strip
- uses corrected Chinese copy for theme, clock, and connection states
- keeps the existing theme toggle and live clock behavior

**Step 2: Run test to verify it passes**

Run:
```bash
cd /d C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend
npm test -- --run src/components/SystemTopbar.test.tsx
```

Expected:
- topbar tests pass with the compact utility structure

**Step 3: Commit**

```bash
git add C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\SystemTopbar.tsx C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\SystemTopbar.test.tsx
git commit -m "refactor: compress topbar into compact utility strip"
```

### Task 4: Rebalance the chart workspace header and vertical proportions

**Files:**
- Modify: `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\KlineChart.tsx`
- Modify: `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\KlineChart.test.tsx`

**Step 1: Write the failing test**

Add tests that prove:

- the chart workspace still renders the toolbar and indicator controls
- the workspace exposes the slimmer header structure instead of the current thicker framing

**Step 2: Run test to verify it fails**

Run:
```bash
cd /d C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend
npm test -- --run src/components/KlineChart.test.tsx
```

Expected:
- at least one test fails because the current workspace header structure does not match the slimmer layout

**Step 3: Write minimal implementation**

Refactor `KlineChart` so it:

- keeps the existing data flow and overlay logic
- tightens the toolbar shell above the chart
- reduces visual height pressure around the canvas
- corrects the modified Chinese labels in loading and empty states

**Step 4: Run test to verify it passes**

Run:
```bash
cd /d C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend
npm test -- --run src/components/KlineChart.test.tsx
```

Expected:
- chart workspace tests pass

**Step 5: Commit**

```bash
git add C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\KlineChart.tsx C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\components\KlineChart.test.tsx
git commit -m "refactor: tighten chart workspace shell"
```

### Task 5: Rebuild the shell theme tokens and shared chrome styling

**Files:**
- Modify: `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\index.css`
- Modify: `C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\App.tsx`

**Step 1: Write minimal implementation**

Refactor the global shell styles so they:

- define clearer dark cyan-teal and light blue-white token sets
- reduce oversized frosted blocks and heavy pattern noise
- slim the sidebar, topbar, and workspace chrome
- preserve fixed sidebar and topbar behavior
- keep the chart area visually dominant without making the canvas feel vertically bloated

**Step 2: Run targeted verification**

Run:
```bash
cd /d C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend
npm test -- --run src/components/AdminSidebar.test.tsx src/components/SystemTopbar.test.tsx src/components/KlineChart.test.tsx
```

Expected:
- updated component tests remain green after the shared style refactor

**Step 3: Commit**

```bash
git add C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\index.css C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend\src\App.tsx
git commit -m "feat: refresh market shell themes and proportions"
```

### Task 6: Run full frontend verification and document the result

**Files:**
- No source changes required unless verification finds issues

**Step 1: Run the full frontend test suite**

Run:
```bash
cd /d C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend
npm test -- --run
```

Expected:
- all frontend tests pass

**Step 2: Run the production build**

Run:
```bash
cd /d C:\Users\Administrator\.config\superpowers\worktrees\quant-trading-system\theme-shell-refactor\frontend
npm run build
```

Expected:
- build succeeds without new errors

**Step 3: Commit**

If verification required any small follow-up fixes, commit them with:

```bash
git add -A
git commit -m "fix: polish shell theme refactor verification issues"
```

If no follow-up fixes were required, do not create an extra commit.
