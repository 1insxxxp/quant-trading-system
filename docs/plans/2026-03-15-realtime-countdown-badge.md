# 实时倒计时同色标签 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 给右侧实时倒计时补一块与原生价格轴标签同逻辑的底色标签，同时保持价格标签原生实现。

**Architecture:** 价格继续完全依赖 `PriceLine` 原生轴标签；倒计时仍使用轻量 DOM 覆盖层，但通过状态携带 `axisLabelColor` 与 `axisLabelTextColor`，让倒计时标签和价格标签使用同一套颜色源。

**Tech Stack:** React、TypeScript、lightweight-charts、Vitest、CSS

---

### Task 1: 先锁定样式约束

**Files:**
- Modify: `frontend/src/index.css.test.js`
- Test: `frontend/src/index.css.test.js`

**Step 1: Write the failing test**

增加断言，要求：

- `.chart-realtime-badge__countdown` 带有标签底色
- 使用 CSS 变量承接背景色和文字色

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/index.css.test.js`

Expected: FAIL

### Task 2: 传递颜色变量

**Files:**
- Modify: `frontend/src/components/KlineChart.tsx`

**Step 1: Extend detached badge state**

增加：

- `backgroundColor`
- `textColor`

**Step 2: Fill from price line options**

使用与 `axisLabelColor`、`axisLabelTextColor` 相同的值填充状态。

### Task 3: 实现倒计时标签样式

**Files:**
- Modify: `frontend/src/index.css`
- Test: `frontend/src/index.css.test.js`

**Step 1: Implement countdown badge**

- 加背景
- 加文字色
- 保持价格轴宽度内居中
- 不恢复价格自绘

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
