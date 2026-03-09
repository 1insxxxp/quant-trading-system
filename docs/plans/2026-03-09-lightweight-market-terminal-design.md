# Lightweight Market Terminal Design

## Goal

将当前过重的“混合型量化驾驶舱”收敛为更适合现阶段能力的轻量控制台行情终端。页面只突出四类核心能力：`K 线图`、`交易所切换`、`交易对切换`、`周期切换`、`价格信息`。

## Problem

当前前端虽然视觉上更像完整量化系统，但和现阶段只有行情能力的产品状态不匹配：

- 左侧导航、右侧运维栏、底部工作流带占据了过多注意力。
- 交易所、交易对、周期的核心控制区不够显眼。
- K 线图不是绝对主角，页面主次关系偏离当前产品价值。
- 新壳层文案过多，放大了“未来能力”，弱化了“现在能用的行情功能”。

## Design Direction

采用“轻量控制台”方案：

- 保留一层简洁的系统感，但不再模拟完整交易台。
- 用单列主工作区承载所有有效功能，保证 K 线图占据最大面积。
- 将控制栏直接放到价格卡和图表上方，让切换交易所、交易对、周期成为页面第一交互层。
- 压缩说明性文案，保留必要状态与上下文。

## Layout

页面改为四段式单列结构：

1. `Topbar`
   - 系统名
   - 当前市场
   - 连接状态
2. `Toolbar`
   - 交易所
   - 交易对
   - 周期
3. `PriceBoard`
   - 最新价格
   - 区间涨跌
   - 连接状态
   - 当前市场
4. `KlineChart`
   - 图表标题
   - 数据来源与连接标记
   - 图表主体

## Visual System

- 延续深色终端风格，但去掉大型驾驶舱栅格和多侧栏结构。
- 保留细边框、少量状态色、单层背景光束，维持“量化系统”气质。
- 提高控制栏和图表容器的视觉权重，让第一视线先落到主功能。
- 所有界面文案中文化，但保留 `Binance`、`OKX`、`BTC/USDT`、`1m/1h/4h` 等行业缩写。

## Non-Goals

- 不新增策略、风控、回测、下单等功能。
- 不实现多工作区导航。
- 不保留当前的左侧导航、右侧运维栏、底部工作流带占位。

## Files To Touch

- `frontend/src/App.tsx`
- `frontend/src/components/SystemTopbar.tsx`
- `frontend/src/components/Toolbar.tsx`
- `frontend/src/components/PriceBoard.tsx`
- `frontend/src/components/KlineChart.tsx`
- `frontend/src/index.css`

## Validation

- 顶部与控制区在桌面端首屏清晰可见。
- 交易所、交易对、周期切换仍然可用。
- K 线图占据页面主要高度。
- 前端测试通过。
- 前端生产构建通过。
