# 服务器 PostgreSQL 升级迁移设计

**目标**

在现有单机云服务器上，将量化行情后端从 SQLite 升级为 PostgreSQL，并完成历史 K 线与交易对数据迁移，同时修复当前 PostgreSQL 提交中的启动、写入、代理和部署问题，确保 API、WebSocket 与历史加载链路可用。

**现状**

- 服务器项目目录为 `/root/apps/quant-trading-system`
- 当前 `pm2` 运行的是 `npm run dev`
- 远端最新提交 `57cf3d1` 已切到 PostgreSQL
- 服务器仍保留旧 SQLite 数据文件 `/root/apps/quant-trading-system/backend/sqlite.db`
- 当前线上日志已出现以下问题：
  - `saveSymbol` 可能引用不存在的 `updated_at`
  - PostgreSQL 初始化未等待完成
  - 默认代理指向 `127.0.0.1:7890`，服务器不可用
  - `tsx watch` 被用作生产启动方式

## 方案选择

### 方案 1：同机分阶段切换

先修代码，再在同一台服务器上备份、建库、导数、切换服务。

优点：
- 风险最低
- 回滚简单
- 不需要额外机器或目录

缺点：
- 需要一次短暂停机切换

### 方案 2：原地热修直接切换

直接在现有目录上修代码、迁移、重启。

优点：
- 最快

缺点：
- 失败时排障和回滚都更麻烦

### 方案 3：新部署目录蓝绿切换

新建一个部署目录完成迁移验证，再替换旧服务。

优点：
- 隔离最好

缺点：
- 对当前单机场景偏重

**采用方案：方案 1**

## 设计

### 1. 数据层

- 保留 PostgreSQL 作为新的主存储
- 修正 `symbols` 表结构与 `saveSymbol` 写入语义，确保 schema 与 upsert 一致
- 将 `klines` upsert 从“累加成交量”改回“整行覆盖 + 更新时间”，避免历史回补和重复预热导致累计放大
- 数据库服务增加显式 `ready()` 或等价初始化屏障，所有查询和写入在 schema 准备完成后再执行
- 保留现有 K 线复合唯一键与索引

### 2. 测试与可维护性

- 后端测试不再依赖真实本地 PostgreSQL
- 为数据库层提供可替换实现或显式 mock 边界，让现有 `kline.service` 测试继续跑在隔离环境里
- 增加针对 PostgreSQL 迁移关键点的测试：
  - schema 初始化顺序
  - `saveSymbol` 冲突更新
  - K 线 upsert 不重复累加

### 3. 服务启动

- 服务器生产进程改为 `pm2 -> npm run start`
- 不再使用 `tsx watch` 作为生产启动方式
- 构建产物由 `backend/dist/server.js` 启动

### 4. 代理策略

- 服务器默认不强制使用 `127.0.0.1:7890`
- 仅当显式配置 `HTTP_PROXY/HTTPS_PROXY/ALL_PROXY` 时才启用代理
- 若服务器本身能直连交易所，则直接访问上游

### 5. 迁移流程

1. 备份当前代码目录与 `sqlite.db`
2. 创建 PostgreSQL 数据库和用户
3. 修正代码后部署到服务器
4. 通过一次性迁移脚本把 SQLite 中的 `symbols` 和 `klines` 导入 PostgreSQL
5. 启动后端并验证 `/api/health`、`/api/symbols`、`/api/klines`、WebSocket
6. 保留 SQLite 备份用于回滚

### 6. 回滚策略

- 保留迁移前代码目录压缩包
- 保留 `sqlite.db` 原文件副本
- 若切换失败：
  - 恢复旧代码
  - 恢复旧 PM2 启动命令
  - 回到 SQLite 版本并重启服务

## 验证标准

- 后端测试通过
- 后端构建通过
- 服务器 `pm2` 进程稳定运行，不再频繁重启
- `/api/health` 返回 `200`
- `/api/klines` 能返回真实 K 线
- `/api/symbols` 能返回 Binance / OKX 交易对
- WebSocket 可连接并收到实时消息
- 首屏历史 K 线加载链路不因数据库切换失效
