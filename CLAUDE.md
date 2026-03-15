# CLAUDE.md

本文档为 Claude Code (claude.ai/code) 在此代码库中工作提供指导。

## 项目概述

量化交易系统，带实时行情数据可视化。系统包含：
- **后端**：Node.js/Express 服务器，支持 WebSocket 实时 K 线数据聚合
- **前端**：React + TypeScript + Vite 应用，使用 lightweight-charts 进行 K 线可视化

## 快速启动命令

### 后端
```bash
cd backend
npm run dev              # 使用 tsx 启动开发服务器 (端口 4000, WS 端口 4001)
npm run test             # 运行 vitest 测试
npm run test:coverage    # 运行测试并生成覆盖率报告
```

### 前端
```bash
cd frontend
npm run dev              # 启动 Vite 开发服务器
npm run test             # 运行 vitest 测试
```

### 本地开发环境
```bash
# 确保 Redis 正在运行
redis-cli ping           # 应返回 PONG

# 启动后端（包含到远程 PostgreSQL 的 SSH 隧道）
cd backend
npm run dev:local        # 自动设置 SSH 隧道 + 后端
npm run dev:local:frontend  # 同时在前端浏览器中打开
```

## 架构

### 后端 (`backend/src/`)

**核心服务：**
- `server.ts` - Express HTTP 服务器 (端口 4000) + WebSocket 服务器 (端口 4001)
- `services/websocket.service.ts` - 管理 WebSocket 连接，处理订阅/取消订阅，广播 K 线更新
- `services/kline.service.ts` - K 线数据获取，带 Redis 缓存层
- `services/market-trade-stream.ts` - 实时交易聚合为 K 线
- `services/trade-aggregator.ts` - 将独立交易聚合为 K 线周期
- `services/sync-state.service.ts` - 追踪每个交易所的 K 线/交易对同步状态

**交易所适配器：**
- `exchanges/binance.ts` - 币安 WebSocket + REST 适配器，带指数退避重连
- `exchanges/okx.ts` - OKX WebSocket + REST 适配器

**数据层：**
- `database/postgres.ts` - PostgreSQL 连接池，模式管理（klines、symbols、kline_sync_state、symbol_sync_state 表）
- `cache/redis.ts` - Redis 缓存热点 K 线数据（TTL 5 分钟，约 10 倍性能提升）

**网络：**
- `network/exchange-transport.ts` - 交易所 HTTP 请求的指数退避重试逻辑
- `network/proxy.ts` - 访问交易所的代理配置

### 前端 (`frontend/src/`)

**状态管理 (Zustand)：**
- `stores/marketStore.ts` - 市场状态（交易所、交易对、周期、K 线、最新价格）
- `stores/uiStore.ts` - UI 状态（侧边栏折叠、主题）

**核心组件：**
- `components/KlineChart.tsx` - 主图表组件，使用 lightweight-charts
- `components/MarketSelect.tsx` - 交易所/交易对/周期选择下拉框
- `components/SystemTopbar.tsx` - 顶部导航栏
- `components/AdminSidebar.tsx` - 可折叠侧边导航
- `components/Toolbar.tsx` - 图表控制（指标、设置）

**工具库：**
- `lib/marketSocket.ts` - WebSocket 客户端，用于实时 K 线更新
- `lib/indicators.ts` - 技术指标计算（MA5、MA10、MA20）
- `hooks/useWebSocket.ts` - React Hook，用于 WebSocket 订阅生命周期

### 数据流

1. 用户选择市场（交易所/交易对/周期）→ `marketStore.setExchange/setSymbol/setInterval`
2. 通过 REST (`/api/klines`) 获取初始 K 线 → 可用时从 Redis 缓存读取
3. 向 `ws://localhost:4001` 发送 WebSocket 订阅消息
4. 实时交易数据到达 → 聚合为 K 线 → 广播给订阅的客户端
5. 前端将传入的 K 线更新合并到图表

### 数据库模式

**klines 表**：`exchange, symbol, interval, open_time, close_time, open, high, low, close, volume, quote_volume, trades_count, is_closed`

**symbols 表**：`exchange, symbol, base_asset, quote_asset, type, status`

**kline_sync_state 表**：追踪每个 (exchange, symbol, interval) 的同步进度

**preferences 表**：图表指标设置（volume, ma5, ma10, ma20）

## 环境变量

在 `.env` 中配置：
- **Redis**：`REDIS_URL=redis://127.0.0.1:6379`
- **PostgreSQL**：通过 SSH 隧道连接远程数据库 (43.134.235.139)
- **代理**：`http://127.0.0.1:7890` 用于访问交易所

## 测试

以监视模式运行测试：
```bash
cd backend && npm run test
cd frontend && npm run test
```

关键测试文件：
- `backend/src/services/*.test.ts` - 服务层测试
- `backend/src/exchanges/*.test.ts` - 交易所适配器测试
- `frontend/src/lib/*.test.ts` - 工具函数测试
- `frontend/src/components/*.test.tsx` - 组件测试

## 常见任务

**添加新的交易所适配器：**
1. 创建 `backend/src/exchanges/{exchange}.ts`，实现 `ExchangeAdapter` 接口
2. 实现 `getKlines()`、`getSymbols()`、`subscribeTrades()` 方法
3. 在 `websocket.service.ts: initExchanges()` 中注册

**添加新指标：**
1. 在 `frontend/src/lib/indicators.ts` 中添加计算逻辑
2. 在 `ChartSettingsDialog.tsx` 中添加指标开关
3. 通过 `/api/preferences/chart-indicators` 端点存储偏好设置

**调试 WebSocket 问题：**
- 检查 `market-trade-stream.ts` 中的 `marketTradeStream` 了解交易聚合逻辑
- 查看交易所适配器的重连逻辑（指数退避）
- 检查 `useWebSocket` hook 了解前端订阅状态
