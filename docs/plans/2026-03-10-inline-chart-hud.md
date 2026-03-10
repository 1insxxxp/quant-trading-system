# Inline Chart HUD Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将图表观察区改成单行无底色 HUD，把成交量图例移到副图左上角，并把十字光标底部时间标签改成中文格式。

**Architecture:** 保持现有 `KlineChart` 数据流不变，只收缩 `ChartInspectorSnapshot` 的字段范围，将主图观察信息和成交量图例拆成两个渲染区域。底部时间标签通过 `lightweight-charts` 的本地化格式化入口统一改成 `Intl.DateTimeFormat`。

**Tech Stack:** React, TypeScript, lightweight-charts, CSS, Vitest

---

### Task 1: Red tests for the new HUD contract

**Files:**
- Modify: `frontend/src/components/ChartInspector.test.tsx`
- Modify: `frontend/src/components/KlineChart.test.tsx`

**Step 1: Write the failing ChartInspector expectations**

- 断言 `ChartInspector` 不再渲染时间
- 断言 `ChartInspector` 不再渲染 `成交量 / 成交额`
- 断言 HUD 仍然渲染 `开 / 高 / 低 / 收 / 涨跌`

**Step 2: Write the failing KlineChart expectations**

- 断言启用 `volume` 时，出现独立的成交量图例
- 断言该图例不再属于 `ChartInspector`
- 断言新的市场标题为 `ETH/USDT · 5m · BINANCE`

**Step 3: Run tests to verify RED**

Run: `npm test -- --run src/components/ChartInspector.test.tsx src/components/KlineChart.test.tsx`
Expected: FAIL with old HUD/time/volume assertions

### Task 2: Implement inline HUD and volume legend

**Files:**
- Modify: `frontend/src/components/ChartInspector.tsx`
- Modify: `frontend/src/components/KlineChart.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Shrink the snapshot contract**

- 从 `ChartInspectorSnapshot` 删除 `timeLabel / volume / quoteVolume`
- 保留 `open / high / low / close / change / percent`

**Step 2: Rebuild ChartInspector markup**

- 改成单行无底色结构
- 保留市场标签与 OHLC/涨跌
- 给 `收` 和 `涨跌` 增加涨跌方向 class

**Step 3: Add the volume-pane legend**

- 在 `KlineChart` 里渲染独立的 `成交量(Volume)` 图例
- 仅在 `indicatorSettings.volume` 为 `true` 时显示
- 使用当前活动 K 线的成交量数值

**Step 4: Restyle the HUD**

- 移除旧卡片背景与 chip 样式依赖
- 主图 HUD 改成单行横向布局
- 成交量图例放在副图左上角，视觉层级更轻

**Step 5: Run targeted tests to verify GREEN**

Run: `npm test -- --run src/components/ChartInspector.test.tsx src/components/KlineChart.test.tsx`
Expected: PASS

### Task 3: Localize crosshair time formatting

**Files:**
- Modify: `frontend/src/components/KlineChart.tsx`
- Modify: `frontend/src/index.css.test.js`

**Step 1: Add localized time formatter**

- 使用 `Intl.DateTimeFormat('zh-CN', ...)`
- 为图表 `localization.timeFormatter` 提供底部标签格式
- 必要时为 `timeScale.tickMarkFormatter` 提供一致的中文日期显示

**Step 2: Add or update regression assertions**

- 断言不再包含 `toLocaleString('sv-SE')`
- 断言代码使用 `Intl.DateTimeFormat`

**Step 3: Run targeted verification**

Run: `npm test -- --run src/index.css.test.js src/components/KlineChart.test.tsx`
Expected: PASS

### Task 4: Final verification

**Files:**
- Modify: `frontend/src/components/ChartInspector.tsx`
- Modify: `frontend/src/components/KlineChart.tsx`
- Modify: `frontend/src/components/ChartInspector.test.tsx`
- Modify: `frontend/src/components/KlineChart.test.tsx`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/index.css.test.js`

**Step 1: Run full frontend tests**

Run: `npm test -- --run`
Expected: PASS

**Step 2: Run production build**

Run: `npm run build`
Expected: PASS
