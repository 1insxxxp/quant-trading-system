# Fixed Collapsible Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为后台行情页增加可持久化折叠侧边栏、固定壳层布局，并压缩顶部价格摘要区。

**Architecture:** 新增一个轻量 UI store 维护侧边栏展开状态，并将状态持久化到 `localStorage`。页面布局从普通文档流切换为固定侧边栏 + 固定顶栏 + 内容区独立滚动，同时将说明性文案收敛为悬浮信息提示组件。

**Tech Stack:** React, TypeScript, Zustand, Vitest, CSS

---

### Task 1: 为侧边栏折叠状态建模

**Files:**
- Create: `frontend/src/stores/uiStore.ts`
- Create: `frontend/src/stores/uiStore.test.ts`

**Step 1: Write the failing test**

- 测试默认展开状态
- 测试从 `localStorage` 读取已保存状态
- 测试切换后会写回 `localStorage`

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/stores/uiStore.test.ts`
Expected: FAIL because the store does not exist

**Step 3: Write minimal implementation**

- 新增 `useUiStore`
- 暴露 `isSidebarCollapsed`
- 暴露 `toggleSidebar` 和 `setSidebarCollapsed`
- 用固定 key 写入 `localStorage`

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/stores/uiStore.test.ts`
Expected: PASS

### Task 2: 改造成固定壳层

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AdminSidebar.tsx`
- Modify: `frontend/src/components/SystemTopbar.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Wire the UI store into the shell**

- `App` 根据折叠状态挂载壳层 class
- 顶栏按钮控制展开/收起

**Step 2: Fix sidebar and topbar**

- 侧边栏固定在左侧
- 顶栏固定在顶部
- 内容区独立滚动

**Step 3: Add transition**

- 侧边栏滑入滑出
- 主内容区宽度与顶栏 left 同步过渡

**Step 4: Run verification**

Run: `npm run build`
Expected: PASS

### Task 3: 压缩价格摘要区与说明文案

**Files:**
- Create: `frontend/src/components/InfoTip.tsx`
- Modify: `frontend/src/components/PriceBoard.tsx`
- Modify: `frontend/src/components/KlineChart.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Add tooltip helper**

- 创建统一信息图标组件
- 支持 hover/focus 显示说明

**Step 2: Compress summary cards**

- 移除多行说明段落
- 保留一行次级信息
- 用信息图标承载解释文案

**Step 3: Reduce chart header copy**

- 去掉主图表大段说明
- 改为图标提示

**Step 4: Run verification**

Run: `npm run build`
Expected: PASS

### Task 4: Final verification

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AdminSidebar.tsx`
- Modify: `frontend/src/components/SystemTopbar.tsx`
- Modify: `frontend/src/components/PriceBoard.tsx`
- Modify: `frontend/src/components/KlineChart.tsx`
- Modify: `frontend/src/index.css`
- Create: `frontend/src/components/InfoTip.tsx`
- Create: `frontend/src/stores/uiStore.ts`
- Create: `frontend/src/stores/uiStore.test.ts`

**Step 1: Run sidebar state tests**

Run: `npm test -- --run src/stores/uiStore.test.ts`
Expected: PASS

**Step 2: Run existing store tests**

Run: `npm test -- --run src/stores/marketStore.test.ts`
Expected: PASS

**Step 3: Run production build**

Run: `npm run build`
Expected: PASS

**Step 4: Manual check**

- 刷新 `http://localhost:5173/quant/`
- 折叠/展开侧边栏
- 刷新页面确认状态保留
- 滚动内容时确认顶栏和侧边栏固定

**Step 5: Commit**

```bash
git add docs/plans/2026-03-09-fixed-collapsible-layout-design.md docs/plans/2026-03-09-fixed-collapsible-layout.md frontend/src/App.tsx frontend/src/components/AdminSidebar.tsx frontend/src/components/SystemTopbar.tsx frontend/src/components/PriceBoard.tsx frontend/src/components/KlineChart.tsx frontend/src/components/InfoTip.tsx frontend/src/stores/uiStore.ts frontend/src/stores/uiStore.test.ts frontend/src/index.css
git commit -m "feat: add collapsible fixed admin layout"
```
