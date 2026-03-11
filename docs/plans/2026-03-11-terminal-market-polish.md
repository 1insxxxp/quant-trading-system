# 终端化行情页面精修 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把行情页的顶栏、市场参数带和图表工作区收紧成更像专业交易终端的主工作面，同时保持现有行情功能和主题切换能力。

**Architecture:** 仅修改前端展示层，围绕 `SystemTopbar`、`Toolbar`、`ChartInspector`、`KlineChart` 和 `index.css` 重构布局与视觉层次。通过测试先锁定关键结构，再以小步提交方式完成样式与文案收口，避免影响实时行情链路。

**Tech Stack:** React, TypeScript, Vite, Vitest, lightweight-charts, CSS variables

---

### Task 1: 锁定顶栏与图表头的目标结构

**Files:**
- Modify: `frontend/src/components/SystemTopbar.test.tsx`
- Modify: `frontend/src/components/KlineChart.test.tsx`
- Modify: `frontend/src/components/Toolbar.test.tsx`

**Step 1: Write the failing tests**

- 在 `SystemTopbar.test.tsx` 中增加断言，要求顶栏输出更轻量的实时价格条和紧凑状态区。
- 在 `KlineChart.test.tsx` 中增加断言，要求图表头不再出现厚重分组外壳，HUD 更偏信息层。
- 在 `Toolbar.test.tsx` 中增加断言，要求参数区使用更终端化的结构类名。

**Step 2: Run tests to verify they fail**

Run: `npm --prefix frontend test -- --run src/components/SystemTopbar.test.tsx src/components/KlineChart.test.tsx src/components/Toolbar.test.tsx`

Expected: 至少一条断言失败，说明结构目标已被测试锁定。

**Step 3: Commit**

```bash
git add frontend/src/components/SystemTopbar.test.tsx frontend/src/components/KlineChart.test.tsx frontend/src/components/Toolbar.test.tsx
git commit -m "test: lock terminal market chrome structure"
```

### Task 2: 收紧顶栏结构与文案

**Files:**
- Modify: `frontend/src/components/SystemTopbar.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Implement the minimal topbar refactor**

- 压缩顶栏结构，把左侧整理为按钮 + 实时价格条。
- 将右侧主题切换、时间、在线状态合并为更紧凑的终端状态带。
- 清理顶栏中仍然存在的乱码文案。

**Step 2: Run focused tests**

Run: `npm --prefix frontend test -- --run src/components/SystemTopbar.test.tsx`

Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/components/SystemTopbar.tsx frontend/src/index.css
git commit -m "feat: compact terminal topbar chrome"
```

### Task 3: 重构市场参数带

**Files:**
- Modify: `frontend/src/components/Toolbar.tsx`
- Modify: `frontend/src/components/Toolbar.test.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Write or update the failing toolbar assertions**

- 要求工具条输出紧凑终端参数带结构。
- 校验交易所、交易对、周期仍然保留标签与可访问属性。

**Step 2: Implement the parameter strip**

- 把三段控件收成一条更贴图表头的工具带。
- 减少厚重底色和大面积空白。
- 保持图标、键盘导航和暗/亮主题兼容。

**Step 3: Run tests**

Run: `npm --prefix frontend test -- --run src/components/Toolbar.test.tsx`

Expected: PASS

**Step 4: Commit**

```bash
git add frontend/src/components/Toolbar.tsx frontend/src/components/Toolbar.test.tsx frontend/src/index.css
git commit -m "feat: tighten market parameter toolbar"
```

### Task 4: 收口 HUD 与图表层次

**Files:**
- Modify: `frontend/src/components/ChartInspector.tsx`
- Modify: `frontend/src/components/ChartInspector.test.tsx`
- Modify: `frontend/src/components/KlineChart.tsx`
- Modify: `frontend/src/components/KlineChart.test.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Write the failing HUD tests**

- 断言 HUD 为更轻的信息层结构。
- 断言关键字段仍然存在：市场标签、开高低收、涨跌、成交量/指标。

**Step 2: Implement HUD and chart body polish**

- 调整 `ChartInspector` 结构，降低卡片感。
- 调整 `KlineChart` 中 HUD、成交量 legend、loading 与 empty state 的布局。
- 降低 `chart-panel__body` 的装饰重量，让画布更突出。

**Step 3: Run targeted tests**

Run: `npm --prefix frontend test -- --run src/components/ChartInspector.test.tsx src/components/KlineChart.test.tsx`

Expected: PASS

**Step 4: Commit**

```bash
git add frontend/src/components/ChartInspector.tsx frontend/src/components/ChartInspector.test.tsx frontend/src/components/KlineChart.tsx frontend/src/components/KlineChart.test.tsx frontend/src/index.css
git commit -m "feat: refine chart hud and workspace hierarchy"
```

### Task 5: 全量验证与联调

**Files:**
- Modify: `frontend/src/index.css` (only if a small follow-up fix is required)

**Step 1: Run full frontend verification**

Run: `npm --prefix frontend test -- --run`

Expected: PASS, 0 failed

**Step 2: Run production build**

Run: `npm --prefix frontend run build`

Expected: build succeeds

**Step 3: Check local integrated flow**

Run:

```bash
curl http://localhost:5173/quant/
curl http://localhost:5173/quant/api/health
```

Expected:
- 页面入口 `200`
- 代理健康检查返回成功 JSON

**Step 4: Final commit if needed**

```bash
git add frontend/src/index.css
git commit -m "fix: polish terminal market layout follow-ups"
```
