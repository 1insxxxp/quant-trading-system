# Market Select Icons Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将图表工具栏里的交易所和交易对选择器升级成带图标的自定义下拉控件。

**Architecture:** 在工具栏中引入一个通用 `MarketSelect` 组件，统一处理展开层、键盘导航、外部点击关闭和选项渲染。交易所 logo 与交易对图标通过本地 SVG/徽章组件提供，不引入远程资源，也不修改 store 的数据流。

**Tech Stack:** React, TypeScript, CSS, Vitest

---

### Task 1: Define option metadata and failing tests

**Files:**
- Modify: `frontend/src/types/index.ts`
- Create: `frontend/src/components/Toolbar.test.tsx`
- Create: `frontend/src/components/MarketSelect.test.tsx`

**Step 1: Extend option types**

- 为工具栏选项补充 `icon`/展示元数据类型
- 保持现有 store 接口兼容

**Step 2: Write failing Toolbar tests**

- 断言当前交易所区域渲染交易所 logo
- 断言当前交易对区域渲染币种图标
- 断言仍然保留 `周期` 原有选择器

**Step 3: Write failing MarketSelect tests**

- 断言点击后展开列表
- 断言 `Escape` 可关闭
- 断言方向键和 `Enter` 可切换选项

**Step 4: Run tests to verify RED**

Run: `npm test -- --run src/components/Toolbar.test.tsx src/components/MarketSelect.test.tsx`
Expected: FAIL with missing custom select/icon behavior

### Task 2: Build icon primitives and custom select

**Files:**
- Create: `frontend/src/components/marketIcons.tsx`
- Create: `frontend/src/components/MarketSelect.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Add exchange and coin icon components**

- 提供 `Binance`、`OKX` 徽章
- 提供 `BTC`、`ETH` 以及通用 fallback coin badge

**Step 2: Build the generic MarketSelect**

- 支持触发按钮、弹层列表、选中态、键盘导航
- 提供 `aria-label`、`role="listbox"`、`role="option"`
- 支持传入自定义图标和辅助文本

**Step 3: Style the control**

- 暗色/亮色都保持终端工具栏风格
- 选项高度、图标尺寸和间距要与现有工具栏一致

**Step 4: Run targeted verification**

Run: `npm test -- --run src/components/MarketSelect.test.tsx`
Expected: PASS

### Task 3: Replace Toolbar selects

**Files:**
- Modify: `frontend/src/components/Toolbar.tsx`
- Modify: `frontend/src/components/Toolbar.test.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Map exchange and symbol options to icon-aware items**

- 交易所选项接入品牌 logo
- 交易对选项接入币种图标与 `/USDT` 展示

**Step 2: Keep interval as-is**

- `周期` 继续沿用当前实现，避免本次范围膨胀

**Step 3: Wire Toolbar state handlers**

- 保持 `setExchange / setSymbol / setInterval / fetchSymbols` 行为不变

**Step 4: Run targeted verification**

Run: `npm test -- --run src/components/Toolbar.test.tsx src/components/MarketSelect.test.tsx`
Expected: PASS

### Task 4: Final verification

**Files:**
- Modify: `frontend/src/components/Toolbar.tsx`
- Modify: `frontend/src/components/MarketSelect.tsx`
- Modify: `frontend/src/components/marketIcons.tsx`
- Modify: `frontend/src/components/Toolbar.test.tsx`
- Modify: `frontend/src/components/MarketSelect.test.tsx`
- Modify: `frontend/src/index.css`

**Step 1: Run full frontend tests**

Run: `npm test -- --run`
Expected: PASS

**Step 2: Run production build**

Run: `npm run build`
Expected: PASS
