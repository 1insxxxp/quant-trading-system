# Lightweight Market Terminal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将当前前端收敛为轻量控制台行情终端，只保留顶栏、控制栏、价格卡和 K 线图。

**Architecture:** 继续使用现有 React 组件和 Zustand 市场状态，不改数据流，只精简页面壳层和样式层。通过删除多余布局区块、压缩文案与重排栅格，让有效功能回到主视图中心。

**Tech Stack:** React, TypeScript, Zustand, lightweight-charts, CSS

---

### Task 1: 精简页面结构

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/SystemTopbar.tsx`

**Step 1: Write the failing test**

本次以界面重构为主，不新增组件行为测试，复用现有 store 测试与构建验证。

**Step 2: Remove heavyweight shell blocks**

- 删除左侧导航导入与渲染。
- 删除右侧运维栏导入与渲染。
- 删除底部工作流带导入与渲染。
- 将 `App` 收为单列主工作区。

**Step 3: Simplify the topbar**

- 保留系统名、当前市场、连接状态。
- 去掉与未来模块相关的多余状态胶囊。

**Step 4: Run verification**

Run: `npm run build`
Expected: PASS

### Task 2: 强化核心行情区

**Files:**
- Modify: `frontend/src/components/Toolbar.tsx`
- Modify: `frontend/src/components/PriceBoard.tsx`
- Modify: `frontend/src/components/KlineChart.tsx`

**Step 1: Reframe toolbar as primary control row**

- 让标题和说明更短。
- 确保三组选择器始终清晰可见。

**Step 2: Compress price board copy**

- 保留四个核心卡片。
- 删除长段落式解释。

**Step 3: Make chart area dominant**

- 保留图表标题、少量状态 badge、空态说明。
- 提高图表容器高度和留白质量。

**Step 4: Run verification**

Run: `npm test -- --run src/stores/marketStore.test.ts`
Expected: PASS

### Task 3: 重写页面样式

**Files:**
- Modify: `frontend/src/index.css`

**Step 1: Remove multi-column dashboard layout**

- 删除侧栏、右 rail、底部 tabs 的样式。
- 改为居中的单列壳层。

**Step 2: Tune visual hierarchy**

- 顶栏更轻。
- 控制栏更直接。
- 图表面板最大化。

**Step 3: Ensure responsive behavior**

- 窄屏下保留单列。
- 控制项自动换行。

**Step 4: Run verification**

Run: `npm run build`
Expected: PASS

### Task 4: Final verification

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/SystemTopbar.tsx`
- Modify: `frontend/src/components/Toolbar.tsx`
- Modify: `frontend/src/components/PriceBoard.tsx`
- Modify: `frontend/src/components/KlineChart.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Run targeted test**

Run: `npm test -- --run src/stores/marketStore.test.ts`
Expected: PASS

**Step 2: Run production build**

Run: `npm run build`
Expected: PASS

**Step 3: Manual check**

- 刷新 `http://localhost:5173/quant/`
- 观察首屏是否直接看到控制栏、价格卡、K 线图
- 确认交易所、交易对、周期控件未被隐藏

**Step 4: Commit**

```bash
git add docs/plans/2026-03-09-lightweight-market-terminal-design.md docs/plans/2026-03-09-lightweight-market-terminal.md frontend/src/App.tsx frontend/src/components/SystemTopbar.tsx frontend/src/components/Toolbar.tsx frontend/src/components/PriceBoard.tsx frontend/src/components/KlineChart.tsx frontend/src/index.css
git commit -m "feat: simplify market terminal layout"
```
