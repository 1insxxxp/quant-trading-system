# 实时倒计时轴内对齐 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让倒计时稳定显示在原生价格轴标签正下方，保留价格原生实现并保证不越界。

**Architecture:** 价格继续完全依赖 `lightweight-charts` 原生价格轴标签；倒计时使用轻量 DOM 覆盖层，并通过 `priceScale('right').width()` 动态约束到价格轴宽度范围内，再在该范围内居中。

**Tech Stack:** React、TypeScript、lightweight-charts、Vitest、CSS

---

### Task 1: 先锁定样式约束

**Files:**
- Modify: `frontend/src/index.css.test.js`
- Test: `frontend/src/index.css.test.js`

**Step 1: Write the failing test**

增加断言，要求：

- `.chart-realtime-badge` 宽度受价格轴宽度变量控制
- 倒计时在该宽度内居中
- 保持透明、无边框、无阴影

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/index.css.test.js`

Expected: FAIL

**Step 3: Keep production code unchanged**

只修改测试，不改实现。

**Step 4: Run test again**

Run: `npm test -- --run src/index.css.test.js`

Expected: FAIL

### Task 2: 调整组件数据结构

**Files:**
- Modify: `frontend/src/components/KlineChart.tsx`

**Step 1: Add width into detached realtime badge state**

为浮层状态增加价格轴宽度字段，并在同步时从 `chart.priceScale('right').width()` 读取。

**Step 2: Keep countdown as the only overlay content**

不恢复价格文本，仍只保留倒计时第二行。

### Task 3: 调整倒计时定位与样式

**Files:**
- Modify: `frontend/src/index.css`
- Test: `frontend/src/index.css.test.js`

**Step 1: Implement centered countdown styling**

- `right: 0`
- `width: var(--chart-price-scale-width, 72px)`
- 水平居中
- 透明背景

**Step 2: Run focused test**

Run: `npm test -- --run src/index.css.test.js`

Expected: PASS

### Task 4: 最终验证

**Files:**
- Verify: `frontend/src/components/KlineChart.tsx`
- Verify: `frontend/src/index.css`

**Step 1: Run focused tests**

Run: `npm test -- --run src/index.css.test.js`

Expected: PASS

**Step 2: Run build**

Run: `npm run build`

Expected: PASS
