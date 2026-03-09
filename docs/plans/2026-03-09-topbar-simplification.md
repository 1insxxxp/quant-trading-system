# Topbar Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 删除顶栏右侧状态块并修复 tooltip 被固定顶栏遮挡的问题。

**Architecture:** 不调整数据流，只精简 `SystemTopbar` 渲染结构，并通过一个最小组件测试锁定新输出。tooltip 问题通过 CSS 层级调整解决。

**Tech Stack:** React, TypeScript, Vitest, CSS

---

### Task 1: 锁定顶栏渲染输出

**Files:**
- Create: `frontend/src/components/SystemTopbar.test.tsx`
- Modify: `frontend/src/components/SystemTopbar.tsx`

**Step 1: Write the failing test**

- 渲染 `SystemTopbar`
- 断言包含 `后台工作台`
- 断言不再包含 `市场`、`标的`、`周期`、`连接`

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/components/SystemTopbar.test.tsx`
Expected: FAIL because the current topbar still renders the four status blocks

**Step 3: Write minimal implementation**

- 删除 `SystemTopbar` 中的状态块区域
- 保留折叠按钮和标题

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/components/SystemTopbar.test.tsx`
Expected: PASS

### Task 2: 修复 tooltip 层级

**Files:**
- Modify: `frontend/src/components/InfoTip.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Raise tooltip above the fixed topbar**

- 调整 tooltip 容器和气泡的 z-index
- 确保固定顶栏不会盖住提示层

**Step 2: Keep topbar compact**

- 顺手移除不再使用的顶栏状态块样式

**Step 3: Run verification**

Run: `npm run build`
Expected: PASS

### Task 3: Final verification

**Files:**
- Modify: `frontend/src/components/SystemTopbar.tsx`
- Create: `frontend/src/components/SystemTopbar.test.tsx`
- Modify: `frontend/src/components/InfoTip.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Run targeted test**

Run: `npm test -- --run src/components/SystemTopbar.test.tsx`
Expected: PASS

**Step 2: Run regression tests**

Run: `npm test -- --run src/stores/uiStore.test.ts src/stores/marketStore.test.ts`
Expected: PASS

**Step 3: Run production build**

Run: `npm run build`
Expected: PASS
