# 实时价格双层标签无缝拼接 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让倒计时块和原生价格标签形成同宽、无缝、左右严格对齐的双层标签效果。

**Architecture:** 保留原生价格轴标签作为上层，倒计时继续用 DOM 覆盖层作为下层。通过价格轴宽度变量让倒计时块铺满整个标签容器，并去除内容宽度收缩造成的错位。

**Tech Stack:** React、TypeScript、Vitest、CSS

---

### Task 1: 锁定无缝拼接样式约束

**Files:**
- Modify: `frontend/src/index.css.test.js`
- Test: `frontend/src/index.css.test.js`

**Step 1: Write the failing test**

增加断言，要求：

- `.chart-realtime-badge__countdown` 使用 `width: 100%`
- `.chart-realtime-badge__countdown` 使用 `box-sizing: border-box`
- 倒计时块仍保留同色背景变量

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/index.css.test.js`

Expected: FAIL

### Task 2: 实现倒计时块铺满与无缝拼接

**Files:**
- Modify: `frontend/src/index.css`

**Step 1: Implement full-width countdown block**

- 给倒计时块加 `width: 100%`
- 用 `box-sizing: border-box`
- 调整内边距和圆角，保证与上块无缝拼接

**Step 2: Run focused test**

Run: `npm test -- --run src/index.css.test.js`

Expected: PASS

### Task 3: 最终验证

**Files:**
- Verify: `frontend/src/index.css`

**Step 1: Run build**

Run: `npm run build`

Expected: PASS
