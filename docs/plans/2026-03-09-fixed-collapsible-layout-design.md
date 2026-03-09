# Fixed Collapsible Layout Design

## Goal

继续收紧当前后台行情页，解决三个直接影响使用效率的问题：

- 顶部价格摘要区占高过大
- 左侧侧边栏无法折叠
- 页面滚动时侧边栏和顶部导航不固定

目标是让主视图更聚焦在 `价格摘要 + K 线图 + 图内切换控件` 上。

## Interaction Decisions

### Sidebar

- 侧边栏支持 `展开 / 隐藏` 两态
- 隐藏时整块退出布局，不再保留缩窄列
- 顶部导航左侧保留一个展开/收起按钮
- 状态写入前端缓存，刷新后保持

### Fixed Shell

- 侧边栏固定在左侧
- 顶部导航固定在顶部
- 页面只让右侧内容区滚动
- 侧边栏展开/隐藏时，主内容区宽度和顶栏左边距同步过渡

### Summary Cards

- 顶部价格区改成更紧凑的摘要卡
- 卡片只展示核心数值和一行次级信息
- 说明性文字尽量不占主页面面积

### Explanatory Copy

- 原来直接放在页面上的解释文案改成信息图标
- 桌面端支持 hover 展示提示
- 焦点状态下也能显示，兼顾键盘访问

## Visual Direction

- 保持当前金融后台风格
- 动画只做短时、低位移的平滑过渡
- 不做抽屉式重动画，不做大面积骨架屏

## Files To Touch

- `frontend/src/App.tsx`
- `frontend/src/components/AdminSidebar.tsx`
- `frontend/src/components/SystemTopbar.tsx`
- `frontend/src/components/PriceBoard.tsx`
- `frontend/src/components/KlineChart.tsx`
- `frontend/src/index.css`
- `frontend/src/stores/uiStore.ts`（new）
- `frontend/src/stores/uiStore.test.ts`（new）
- `frontend/src/components/InfoTip.tsx`（new）

## Validation

- 侧边栏支持折叠/展开，且状态刷新后保留
- 顶部导航与侧边栏固定，内容区独立滚动
- 价格摘要区高度明显压缩
- 说明性文案改为 hover 信息提示
- 前端测试通过
- 前端构建通过
