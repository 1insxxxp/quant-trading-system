# Terminal Toolbar Design

## Goal

将核心图表上方区域改造成更像专业交易终端的紧凑工具条，并让左上角侧边栏按钮根据展开/收起状态切换图标语义。

## Design Decisions

### Sidebar Toggle

- 不再始终显示相同的汉堡图标
- 侧边栏展开时显示“收起”语义
- 侧边栏收起时显示“展开”语义
- 图标切换带轻微动画

### Chart Header

- 头部改为单行终端工具条
- 左侧显示当前市场主标题
- 中间放 `交易所 / 交易对 / 周期` 三个控件
- 右侧放 `周期 / K线数量 / 数据源 / 推送状态` badge

### Visual Style

- 工具条整体更薄、更紧凑
- 去掉大面积分组块感
- 控件和 badge 统一高度
- 更接近专业终端参数栏，而不是后台筛选卡片

## Non-Goals

- 不改数据流
- 不改 store 行为
- 不改侧边栏折叠逻辑

## Files To Touch

- `frontend/src/components/SystemTopbar.tsx`
- `frontend/src/components/KlineChart.tsx`
- `frontend/src/components/Toolbar.tsx`
- `frontend/src/index.css`

## Validation

- 左上角按钮会随侧边栏状态切换图标
- 图表头部高度下降
- 控件与 badge 在同一终端工具条中
- 前端测试通过
- 前端构建通过
