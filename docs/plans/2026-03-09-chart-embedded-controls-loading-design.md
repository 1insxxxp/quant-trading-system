# Chart Embedded Controls And Loading Design

## Goal

将 `交易所 / 交易对 / 周期` 控件直接并入 K 线图卡片头部，并在切换任一条件时为图表提供就地 loading 反馈，避免用户每次操作后还要滚动回图表查看结果。

## Problem

当前后台壳层虽然已经更稳定，但交互仍有两个明显问题：

- 切换控件和 K 线图分离，用户操作后需要重新寻找图表。
- 切换市场条件时没有明确的图内 loading 状态，反馈不够直接。

## Interaction Design

K 线图卡片升级为完整工作单元：

- 头部左侧显示图表标题和当前市场说明
- 头部中间直接放 `交易所 / 交易对 / 周期` 三个控件
- 头部右侧保留状态 badge

这样切换条件和结果展示处于同一个视觉块中。

## Loading Behavior

切换 `交易所`、`交易对` 或 `周期` 时：

- 图表立刻进入 `isLoadingKlines` 状态
- 图表区域出现半透明遮罩
- 遮罩包含轻量旋转指示器和“正在加载 K 线数据”文案
- 底层旧图保留并被压暗，直到新数据返回

这能让用户明确感知“正在切换”，同时避免空白闪烁。

## State Flow

前端状态层增加 `isLoadingKlines`：

- 切换条件时立即置为 `true`
- 历史 K 线请求完成后置为 `false`
- 请求失败也要置为 `false`
- 旧请求如果已过期，不得错误覆盖当前 loading 状态

为了支持图内 loading，`KlineChart` 不再依赖 `key` 强制重挂载。

## Visual Direction

- 控件风格继续沿用后台表单视觉
- 图内 loading 采用克制白色蒙层，不做夸张动画
- 价格卡文案继续压缩，避免首屏过高

## Files To Touch

- `frontend/src/App.tsx`
- `frontend/src/components/Toolbar.tsx`
- `frontend/src/components/KlineChart.tsx`
- `frontend/src/stores/marketStore.ts`
- `frontend/src/stores/marketStore.test.ts`
- `frontend/src/types/index.ts`
- `frontend/src/index.css`

## Validation

- 控件出现在 K 线图卡片头部
- 切换交易所、交易对、周期时，图表立即显示 loading 遮罩
- 新数据返回后 loading 消失
- 旧图在 loading 期间保留但被压暗
- 前端测试通过
- 前端构建通过
