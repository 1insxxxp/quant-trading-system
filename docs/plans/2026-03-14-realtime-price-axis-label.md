# 实时价格轴标签 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将右侧实时价格改成图表价格轴原生标签，并把倒计时收成轴内第二行辅助信息。

**Architecture:** 继续使用现有 `PriceLine` 驱动实时价格线，但开启原生价格轴标签；自绘 DOM 仅保留倒计时，不再承载价格文本。通过 CSS 限定倒计时贴靠右侧价格轴内边缘，不超出图表边界。

**Tech Stack:** React、TypeScript、lightweight-charts、Vitest、CSS

---

### Task 1: 锁定右侧实时价格样式约束

**Files:**
- Modify: `frontend/src/index.css.test.js`
- Test: `frontend/src/index.css.test.js`

**Step 1: Write the failing test**

增加断言，要求：

- `.chart-realtime-badge` 仅保留倒计时辅助定位样式
- 不再包含大面积背景与价格块式边框

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/index.css.test.js`

Expected: FAIL，说明当前样式仍然是自绘价格块

**Step 3: Write minimal implementation**

只修改测试，不改生产代码。

**Step 4: Run test to verify it still fails**

Run: `npm test -- --run src/index.css.test.js`

Expected: FAIL

### Task 2: 切换实时价格到原生价格轴标签

**Files:**
- Modify: `frontend/src/components/KlineChart.tsx`
- Test: `frontend/src/index.css.test.js`

**Step 1: Write the failing test**

在现有样式测试基础上，要求倒计时浮层不再承担价格主文本显示。

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/index.css.test.js`

Expected: FAIL

**Step 3: Write minimal implementation**

- 将 `PriceLine` 的 `axisLabelVisible` 改为 `true`
- 保留 `lineVisible`
- `chart-realtime-badge` 只渲染倒计时

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/index.css.test.js`

Expected: PASS

### Task 3: 收紧倒计时到价格轴内部

**Files:**
- Modify: `frontend/src/index.css`
- Test: `frontend/src/index.css.test.js`

**Step 1: Write the failing test**

断言：

- `.chart-realtime-badge` 贴靠右侧，不越界
- 去掉多余背景、侧边框、价格大字样式
- 倒计时字号小于价格轴价格字号

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/index.css.test.js`

Expected: FAIL

**Step 3: Write minimal implementation**

调整 `.chart-realtime-badge*` 样式：

- 移除价格块视觉
- 保留辅助倒计时定位
- 保证第二行布局

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/index.css.test.js`

Expected: PASS

### Task 4: 最终验证

**Files:**
- Verify: `frontend/src/components/KlineChart.tsx`
- Verify: `frontend/src/index.css`
- Verify: `frontend/src/index.css.test.js`

**Step 1: Run focused tests**

Run: `npm test -- --run src/index.css.test.js`

Expected: PASS

**Step 2: Run frontend build**

Run: `npm run build`

Expected: PASS
