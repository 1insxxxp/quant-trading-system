# Market Admin Shell Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将当前单列行情终端重构为传统后台壳层，保留单个行情模块并为未来模块预留侧边栏菜单占位。

**Architecture:** 保持现有 React + Zustand 行情数据流不变，只重构页面容器与展示层。新增一个侧边栏组件负责模块导航占位，顶部栏承载系统级信息，右侧内容区继续复用 `Toolbar`、`PriceBoard` 和 `KlineChart`。

**Tech Stack:** React, TypeScript, Zustand, lightweight-charts, CSS

---

### Task 1: 建立后台壳层

**Files:**
- Create: `frontend/src/components/AdminSidebar.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/SystemTopbar.tsx`

**Step 1: Write the failing test**

本次以布局重构为主，不新增行为测试，依赖现有 store 测试与构建验证。

**Step 2: Add sidebar component**

- 创建 `AdminSidebar`
- 提供一个可用菜单项和多个筹备中占位项
- 区分 active 与 planned 状态

**Step 3: Rebuild app shell**

- `App` 改成后台双栏结构
- 左侧挂 `AdminSidebar`
- 右侧包含 `SystemTopbar` 和主内容区

**Step 4: Simplify topbar**

- 顶栏只保留系统名、当前市场、连接状态

**Step 5: Run verification**

Run: `npm run build`
Expected: PASS

### Task 2: 重排行情主内容区

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Toolbar.tsx`
- Modify: `frontend/src/components/PriceBoard.tsx`
- Modify: `frontend/src/components/KlineChart.tsx`

**Step 1: Add page header block**

- 右侧内容区第一块显示 `行情中心`
- 增加当前模块说明和市场摘要卡

**Step 2: Keep market controls prominent**

- `Toolbar` 保持为主操作区
- 文案改为后台语境

**Step 3: Keep chart dominant**

- `PriceBoard` 保留四张卡
- `KlineChart` 占右侧大部分高度

**Step 4: Run verification**

Run: `npm test -- --run src/stores/marketStore.test.ts`
Expected: PASS

### Task 3: 重写后台样式

**Files:**
- Modify: `frontend/src/index.css`

**Step 1: Introduce admin layout styles**

- 左侧固定导航样式
- 顶部导航样式
- 内容区栅格与卡片样式

**Step 2: Add sidebar states**

- 可用项高亮
- 占位项显示筹备中

**Step 3: Preserve responsive behavior**

- 小屏下侧边栏收为顶部块
- 内容区保持单列可读

**Step 4: Run verification**

Run: `npm run build`
Expected: PASS

### Task 4: Final verification

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/AdminSidebar.tsx`
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
- 观察是否为传统后台结构
- 确认左侧侧边栏、顶部导航、右侧行情模块层级清晰
- 确认交易所、交易对、周期控件仍可见

**Step 4: Commit**

```bash
git add docs/plans/2026-03-09-market-admin-shell-design.md docs/plans/2026-03-09-market-admin-shell.md frontend/src/App.tsx frontend/src/components/AdminSidebar.tsx frontend/src/components/SystemTopbar.tsx frontend/src/components/Toolbar.tsx frontend/src/components/PriceBoard.tsx frontend/src/components/KlineChart.tsx frontend/src/index.css
git commit -m "feat: reshape market page into admin shell"
```
