# Terminal Toolbar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将图表头部改造成专业交易终端工具条，并让侧边栏按钮根据当前状态切换图标。

**Architecture:** 保持现有布局和状态流不变，只重构 `SystemTopbar` 中的按钮图标渲染，以及 `KlineChart`/`Toolbar` 的头部布局和样式层。交互行为不变，主要提升视觉效率和专业感。

**Tech Stack:** React, TypeScript, CSS, Vitest

---

### Task 1: 调整侧边栏按钮图标

**Files:**
- Modify: `frontend/src/components/SystemTopbar.tsx`
- Modify: `frontend/src/components/SystemTopbar.test.tsx`

**Step 1: Update the test**

- 断言 `SystemTopbar` 保留标题
- 断言按钮带有正确的 `aria-label`

**Step 2: Implement dual-state icon**

- 展开态显示收起语义图标
- 收起态显示展开语义图标

**Step 3: Run verification**

Run: `npm test -- --run src/components/SystemTopbar.test.tsx`
Expected: PASS

### Task 2: 重排图表头部

**Files:**
- Modify: `frontend/src/components/KlineChart.tsx`
- Modify: `frontend/src/components/Toolbar.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Flatten the chart header**

- 当前市场标题、控件、badge 放进单行结构
- 弱化辅助标题文案

**Step 2: Tighten the controls**

- 下拉框高度缩小
- 外层样式从“大卡片块”改成“终端工具条”

**Step 3: Align badges with controls**

- badge 与控件对齐
- 减少头部垂直占高

**Step 4: Run verification**

Run: `npm run build`
Expected: PASS

### Task 3: Final verification

**Files:**
- Modify: `frontend/src/components/SystemTopbar.tsx`
- Modify: `frontend/src/components/SystemTopbar.test.tsx`
- Modify: `frontend/src/components/KlineChart.tsx`
- Modify: `frontend/src/components/Toolbar.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Run targeted tests**

Run: `npm test -- --run src/components/SystemTopbar.test.tsx src/stores/uiStore.test.ts src/stores/marketStore.test.ts`
Expected: PASS

**Step 2: Run production build**

Run: `npm run build`
Expected: PASS
