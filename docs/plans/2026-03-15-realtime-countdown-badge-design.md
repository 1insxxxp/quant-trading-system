# 实时倒计时同色标签设计

**日期：** 2026-03-15

## 背景

右侧实时价格已经恢复为 `lightweight-charts` 原生价格轴标签，倒计时也已经能稳定显示在价格标签正下方。当前剩余问题是倒计时还是纯文字，没有和价格标签保持一致的底色逻辑。

## 目标

- 保持实时价格继续由图表原生价格轴标签渲染
- 倒计时保留在价格标签正下方
- 倒计时增加与价格标签一致的底色逻辑
- 不引入新的越界问题

## 方案

### 价格

价格继续使用 `PriceLine` 原生轴标签，不改绘制方式。

### 倒计时

倒计时仍然是自绘辅助层，但从“纯文字”调整为“独立小标签”：

- 标签底色与价格标签背景色一致
- 标签文字色与价格标签文字色一致
- 标签仍然通过价格轴宽度约束并在其中居中

### 数据传递

当前 `DetachedRealtimeBadgeState` 只保存位置、倒计时和涨跌方向。为了让倒计时底色和原生价格标签保持一致，需要在同步时同时保存：

- `backgroundColor`
- `textColor`

这两个值直接复用 `PriceLine` 当前使用的 `axisLabelColor` 与 `axisLabelTextColor`，保证逻辑完全一致。

## 涉及文件

- `frontend/src/components/KlineChart.tsx`
- `frontend/src/index.css`
- `frontend/src/index.css.test.js`

## 验证标准

- 价格仍只由原生价格轴标签显示
- 倒计时有底色，且与价格标签色逻辑一致
- 倒计时仍位于价格标签正下方且不越界
- `npm test -- --run src/index.css.test.js`
- `npm run build`
