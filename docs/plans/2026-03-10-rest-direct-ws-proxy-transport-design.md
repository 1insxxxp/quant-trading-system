# REST直连与WebSocket代理传输设计

## 背景

当前后端把 REST 请求和 WebSocket 上游订阅共用同一套代理配置。实际联调中，这台本机环境表现为：

- Binance REST 直连可用
- Binance trade WebSocket 直连握手超时
- 一旦 `.env` 里清空代理变量，历史 K 线仍能加载，但实时 `price/kline` 会完全停止

这会让系统进入一种“页面看起来能用，但实时链路已经死掉”的不透明状态。

## 目标

把交易所接入层改造成可配置的双通道传输策略：

- REST 和 WebSocket 各自独立配置
- 默认优先策略更贴近当前环境：
  - REST 优先直连
  - WebSocket 优先代理
- 支持 `direct / proxy / auto`
- 失败时有明确的降级和日志
- 本地与服务器共用同一套代码，只通过环境变量切换策略

## 非目标

- 不改前端协议
- 不改业务层的 `price/kline` 聚合逻辑
- 不新增复杂的无限重试状态机
- 不做 UI 层联机状态改版

## 方案对比

### 方案 1：只修本地 `.env`

直接把代理重新写回本地环境文件。

优点：
- 快

缺点：
- 行为仍然依赖手工记忆
- 本地和服务器的网络策略继续耦合
- 之后很容易再次出现“历史有、实时没”的问题

### 方案 2：环境可配置的分流策略

在后端抽一层传输策略，把 REST 和 WebSocket 的连接配置分离。

优点：
- 代码行为清晰
- 可测试
- 本地和服务器只改环境，不改实现

缺点：
- 需要补配置解析与测试

### 方案 3：运行时自动探测网络

程序启动时主动探测 REST/WS 哪条能通，再自动选路。

优点：
- 理论上最自动化

缺点：
- 复杂度高
- 调试成本大
- 当前阶段不需要

## 结论

采用方案 2。

## 架构设计

### 配置层

新增独立传输配置概念：

- `EXCHANGE_REST_TRANSPORT`
- `EXCHANGE_WS_TRANSPORT`
- `EXCHANGE_PROXY_URL`

每个 transport 取值：

- `direct`
- `proxy`
- `auto`

默认行为：

- REST：`auto`，首选 `direct`
- WebSocket：`auto`，首选 `proxy`

### 传输解析层

在 `backend/src/network` 下新增统一解析函数，输出：

- REST 用的 `axios` agent 配置
- WebSocket 用的 `ws` agent 配置
- 当前使用的是 `direct` 还是 `proxy`
- 是否属于 fallback

`auto` 模式下的策略：

- REST：先尝试 `direct`，失败后降级为 `proxy`
- WebSocket：先尝试 `proxy`，失败后降级为 `direct`

### 交易所适配器

Binance 和 OKX 适配器统一改为：

- REST 请求不再直接读取 `HTTP_PROXY/HTTPS_PROXY/ALL_PROXY`
- WebSocket 连接也不直接读这三项
- 改为从传输解析层拿配置

这样同一个环境里可以出现：

- REST 直连
- WebSocket 走代理

### 日志与可观测性

适配器在关键失败处打印当前通道策略，例如：

- `Binance REST transport failed via direct`
- `Binance trade WebSocket transport failed via proxy`
- `Binance trade WebSocket recovered via direct fallback`

要求：

- 首次失败有明确日志
- fallback 成功有恢复日志
- 不做高频刷屏

## 错误处理

### direct

只尝试直连，失败直接抛错。

### proxy

只尝试代理，失败直接抛错。

### auto

按首选策略试一次，失败后再尝试另一路；如果仍失败，则抛出包含两次尝试信息的错误。

## 测试策略

### 单元测试

- transport 配置解析
- `auto` 模式优先级
- fallback 行为
- Binance/OKX adapter 对 REST/WS 分别拿到正确的 agent 配置

### 集成验证

本地验证目标：

- 清空代理后，WS 实时流中断可复现
- 设置 `REST:auto / WS:auto + proxy` 后，历史与实时同时恢复
- 浏览器页面恢复 `price/kline` 实时更新

## 成功标准

- 本地实时行情恢复稳定
- warmup REST 失败率明显下降
- 服务器部署无需改代码，只改环境变量即可
- 以后更换代理或迁移环境时，不再需要手工改适配器逻辑
