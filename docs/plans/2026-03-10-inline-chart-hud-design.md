# Inline Chart HUD Design

## Goal

将当前左上角卡片式图表观察区改成更接近专业交易终端的单行顶栏，同时把十字光标底部时间标签统一成中文日期格式，并把成交量信息移回成交量副图内部。

## Design Decisions

### Inline Main HUD

- 左上角主图信息改成单行无底色信息条
- 顺序固定为 `交易对 · 周期 · 交易所 · 开 · 高 · 低 · 收 · 涨跌`
- HUD 中不再显示时间
- HUD 中不再显示 `成交量 / 成交额`
- `收` 和 `涨跌` 根据当前 K 线涨跌切换颜色

### Volume Pane Legend

- 只有在启用 `成交量` 指标时才显示成交量图例
- 成交量图例放在成交量副图左上角
- 图例格式为 `成交量(Volume) 数值`
- 不启用成交量时，不渲染该图例

### Crosshair Time Format

- 底部 hover 时间标签改成中文本地化格式
- 使用 `Intl.DateTimeFormat('zh-CN', ...)`
- 目标视觉接近 `周二 2026-03-10 22:00`
- 避免再使用 `sv-SE` 这类硬编码格式

### Visual Style

- HUD 去掉卡片背景、边框、模糊和圆角块感
- 信息项改成单行排列，保留固定宽度和 `tabular-nums`
- 数值颜色只对关键信息做涨跌强调，其余保持中性色
- 成交量副图图例风格与主图 HUD 保持一致，但层级更轻

## Non-Goals

- 不新增技术指标
- 不改指标配置接口
- 不调整 K 线/成交量数据源
- 不修改页面整体布局

## Files To Touch

- `frontend/src/components/ChartInspector.tsx`
- `frontend/src/components/KlineChart.tsx`
- `frontend/src/components/ChartInspector.test.tsx`
- `frontend/src/components/KlineChart.test.tsx`
- `frontend/src/index.css`
- `frontend/src/index.css.test.js`

## Validation

- 主图左上角 HUD 为无底色单行信息条
- HUD 不再显示时间、成交量、成交额
- `收` 与 `涨跌` 颜色跟随当前 K 线方向变化
- 启用成交量指标时，成交量副图左上角显示 `成交量(Volume)` 图例
- 关闭成交量指标时，不显示成交量图例
- 底部 hover 时间标签使用中文本地化日期格式
- 前端测试通过
- 前端构建通过
