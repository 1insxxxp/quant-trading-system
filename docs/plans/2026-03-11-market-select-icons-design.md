# Market Select Icons Design

## Goal

把图表工具栏里的 `交易所` 和 `交易对` 控件从原生下拉升级成带图标的自定义选择器，让当前选中项和展开列表都能展示交易所 logo 与交易对币种图标，同时保持现有功能、状态流和页面整体布局不变。

## Design Decisions

### Custom Select Controls

- `交易所` 与 `交易对` 都改成统一的自定义选择器组件
- 不再依赖原生 `select`，以便稳定展示图标、状态和 hover 效果
- 保留当前工具栏结构和字段顺序，不改变现有数据流

### Exchange Logos

- 为 `Binance`、`OKX` 提供专用小徽章 logo
- 当前选中项与展开列表都显示 logo
- logo 风格偏终端化，尺寸小、边缘锐利、与现有科技感工具栏一致

### Symbol Icons

- 交易对图标聚焦 `base asset`
- `BTC/USDT` 显示 `BTC` coin badge
- `ETH/USDT` 显示 `ETH` coin badge
- 如果未来遇到未预设币种，自动回退成首字母 badge，不出现空白

### Interaction and Accessibility

- 组件支持：
  - 点击展开/收起
  - 点击外部关闭
  - `Escape` 关闭
  - 键盘方向键移动高亮
  - `Enter / Space` 选中
- 保留明确的 `aria-label`、`role` 和焦点态
- 亮色/暗色主题都要适配

### Visual Style

- 控件保持终端工具栏的紧凑高度
- 选中态更像专业交易终端里的参数选择器，而不是表单下拉
- 文本、图标、箭头三者对齐紧凑，避免因图标加入导致控件高度膨胀

## Non-Goals

- 不新增更多业务字段
- 不重做工具栏整体布局
- 不接入外部图标库或远程图片资源
- 不修改后端接口

## Files To Touch

- `frontend/src/components/Toolbar.tsx`
- `frontend/src/components/MarketSelect.tsx`
- `frontend/src/components/MarketSelect.test.tsx`
- `frontend/src/components/Toolbar.test.tsx`
- `frontend/src/components/marketIcons.tsx`
- `frontend/src/types/index.ts`
- `frontend/src/index.css`

## Validation

- 交易所当前值和下拉选项都显示对应 logo
- 交易对当前值和下拉选项都显示对应币种图标
- 选择功能与当前 `exchange/symbol/interval` 状态流一致
- 亮色与暗色主题显示正常
- 键盘与点击交互可用
- 前端测试通过
- 前端构建通过
