# Market Admin Shell Design

## Goal

将当前行情页面改造成更适合后续扩展的传统管理后台框架：左侧侧边栏、顶部导航栏、右侧内容区。当前只承载一个 `行情中心` 模块，同时为未来的交易、策略、风控、回测、日志模块预留清晰占位。

## Why Change

当前页面虽然已经收敛到行情终端，但整体还是更像单页看盘界面，不像一个会继续长成完整量化系统的后台产品。用户明确希望使用更熟悉的后台组织方式：

- 左侧侧边栏负责模块导航
- 顶部导航负责系统级上下文
- 右侧内容区承载当前功能模块

这种结构更稳定，也更利于未来增加模块。

## Layout

页面采用经典后台壳层：

1. `Sidebar`
   - 顶部品牌区
   - 当前唯一可用菜单：`行情中心`
   - 未来模块占位：`交易执行`、`策略管理`、`风控中心`、`回测分析`、`系统日志`
   - 占位项明确显示“筹备中”，不做假可用状态
2. `Topbar`
   - 系统名
   - 当前市场摘要
   - 实时连接状态
3. `Content`
   - 页面标题区
   - 行情控制栏
   - 价格信息卡
   - K 线图主卡片

## Content Structure

右侧内容区只服务当前有效功能：

- 标题区说明当前是 `行情中心`
- 控制栏固定放 `交易所 / 交易对 / 周期`
- 价格卡保留 `最新价格 / 区间涨跌 / 连接状态 / 当前市场`
- K 线图保持为主视觉区域

不再混入运维栏、工作流带、策略监控等尚未实现的内容。

## Visual Direction

采用“金融后台终端”风格：

- 整体是传统后台框架，不走驾驶舱夸张风格
- 左侧栏更像系统导航面板，层级稳定
- 顶栏轻量，不抢主内容
- 内容区卡片保持专业、克制、深色金融终端质感
- 中文文案为主，保留 `Binance`、`OKX`、`BTC/USDT`、`1m/1h/4h` 等行业缩写

## Non-Goals

- 不新增路由系统
- 不新增后台真实模块
- 不实现菜单点击切换页面
- 不调整现有行情数据获取逻辑

## Files To Touch

- `frontend/src/App.tsx`
- `frontend/src/components/SystemTopbar.tsx`
- `frontend/src/components/Toolbar.tsx`
- `frontend/src/components/PriceBoard.tsx`
- `frontend/src/components/KlineChart.tsx`
- `frontend/src/index.css`
- `frontend/src/components/AdminSidebar.tsx`（new）

## Validation

- 桌面端呈现为标准后台布局
- 左侧菜单显示一个可用模块和多个筹备中占位
- 交易所、交易对、周期切换仍然可用
- K 线图仍然是右侧内容区主角
- 前端测试通过
- 前端构建通过
