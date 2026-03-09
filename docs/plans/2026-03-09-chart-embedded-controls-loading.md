# Chart Embedded Controls And Loading Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将行情切换控件移入 K 线图卡片头部，并为切换行为增加图内 loading 动画。

**Architecture:** 保持现有后台布局和 WebSocket/REST 数据流，主要调整前端展示结构与 Zustand 状态。通过给 store 增加 `isLoadingKlines`，让图表在不重挂载的情况下保留旧图并显示覆盖式 loading。

**Tech Stack:** React, TypeScript, Zustand, lightweight-charts, CSS

---

### Task 1: 为 K 线请求增加加载状态

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/stores/marketStore.ts`
- Test: `frontend/src/stores/marketStore.test.ts`

**Step 1: Write the failing test**

- 为市场切换增加一个新测试：
  - 切换时保留已有 K 线
  - 清空最新价格
  - `isLoadingKlines` 立刻变为 `true`
- 为请求完成增加一个新测试：
  - `fetchKlines()` 发起后进入 loading
  - 请求完成后 `isLoadingKlines` 变为 `false`

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/stores/marketStore.test.ts`
Expected: FAIL because `isLoadingKlines` does not exist and current behavior clears K 线

**Step 3: Write minimal implementation**

- 在 `MarketState` 增加 `isLoadingKlines`
- 切换条件时保留 `klines`，清空 `latestPrice`，置 `isLoadingKlines: true`
- `fetchKlines()` 开始时置 `true`
- 成功或失败结束时置 `false`

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/stores/marketStore.test.ts`
Expected: PASS

### Task 2: 将控件嵌入 K 线图头部

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Toolbar.tsx`
- Modify: `frontend/src/components/KlineChart.tsx`

**Step 1: Move toolbar into chart panel**

- `App` 不再单独渲染 `Toolbar`
- `KlineChart` 头部直接渲染 `Toolbar`

**Step 2: Simplify toolbar markup**

- `Toolbar` 改成纯控件组
- 去掉独立卡片外壳和说明文案

**Step 3: Remove forced chart remount**

- `App` 移除图表 `key`
- 图表组件自行响应数据和状态变化

**Step 4: Run verification**

Run: `npm run build`
Expected: PASS

### Task 3: 添加图内 loading 动画

**Files:**
- Modify: `frontend/src/components/KlineChart.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Render loading overlay**

- 读取 `isLoadingKlines`
- loading 时在图表区渲染半透明遮罩、旋转指示器和文案

**Step 2: Dim background chart**

- loading 时给图表画布增加压暗效果
- 保留旧图作为背景

**Step 3: Tune header layout**

- 让标题、控件和 badge 共存在图表头部
- 响应式下自动换行

**Step 4: Run verification**

Run: `npm run build`
Expected: PASS

### Task 4: Final verification

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Toolbar.tsx`
- Modify: `frontend/src/components/KlineChart.tsx`
- Modify: `frontend/src/stores/marketStore.ts`
- Modify: `frontend/src/stores/marketStore.test.ts`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/index.css`

**Step 1: Run targeted test**

Run: `npm test -- --run src/stores/marketStore.test.ts`
Expected: PASS

**Step 2: Run production build**

Run: `npm run build`
Expected: PASS

**Step 3: Manual check**

- 刷新 `http://localhost:5173/quant/`
- 确认切换控件位于 K 线图头部
- 切换交易所、交易对、周期时看到图内 loading

**Step 4: Commit**

```bash
git add docs/plans/2026-03-09-chart-embedded-controls-loading-design.md docs/plans/2026-03-09-chart-embedded-controls-loading.md frontend/src/App.tsx frontend/src/components/Toolbar.tsx frontend/src/components/KlineChart.tsx frontend/src/stores/marketStore.ts frontend/src/stores/marketStore.test.ts frontend/src/types/index.ts frontend/src/index.css
git commit -m "feat: embed market controls into chart panel"
```
