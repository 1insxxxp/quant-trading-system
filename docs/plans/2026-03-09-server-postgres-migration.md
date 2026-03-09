# 服务器 PostgreSQL 升级迁移 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 PostgreSQL 迁移代码并将云服务器上的量化行情后端安全切换到 PostgreSQL。

**Architecture:** 先在隔离 worktree 中修复 PostgreSQL schema、初始化、测试边界和代理策略，再将修复部署到现有服务器。服务器侧采用“备份 -> 建库 -> 导数 -> 切换 PM2 -> 验证”的单机分阶段迁移方案，确保可回滚。

**Tech Stack:** TypeScript, Express, pg, SQLite, PM2, PostgreSQL 15, Node.js 18

---

### Task 1: 固化失败基线与迁移测试目标

**Files:**
- Modify: `backend/src/services/kline.service.test.ts`
- Create: `backend/src/database/postgres.test.ts`

**Step 1: 写失败测试**

- 为 PostgreSQL 数据库层补测试，覆盖：
  - `saveSymbol` 不引用不存在的列
  - 数据库初始化完成前不会执行业务查询
  - K 线重复写入不累加 volume
- 调整 `kline.service` 测试，使其不再强依赖真实本地 PostgreSQL。

**Step 2: 运行失败测试**

Run: `npm test -- --run src/database/postgres.test.ts src/services/kline.service.test.ts`

Expected:
- 至少出现 schema / 初始化 / 连接边界相关失败

**Step 3: 提交最小测试骨架**

在测试中引入可替换数据库依赖或 mock seam，但不修实现。

**Step 4: 再次运行确认仍为预期失败**

Run: `npm test -- --run src/database/postgres.test.ts src/services/kline.service.test.ts`

Expected:
- 失败原因稳定且指向待修根因

### Task 2: 修复 PostgreSQL 数据库服务

**Files:**
- Modify: `backend/src/database/postgres.ts`
- Modify: `backend/src/types/index.ts`（如需补类型）

**Step 1: 最小实现 schema 修复**

- 为 `symbols` 增加 `updated_at`，或移除 `saveSymbol` 中对该列的更新引用
- 引入显式初始化 Promise / `ready()` 屏障
- 所有数据库读写在初始化完成后执行

**Step 2: 修复 K 线 upsert 语义**

- 将 PostgreSQL 的 K 线冲突更新改为覆盖当前 candle 最新值，而不是累加 volume / quote_volume / trades_count

**Step 3: 运行测试**

Run: `npm test -- --run src/database/postgres.test.ts src/services/kline.service.test.ts`

Expected:
- 新增测试通过
- 现有 K 线服务测试通过

### Task 3: 修复服务器可部署性

**Files:**
- Modify: `backend/src/network/proxy.ts`
- Modify: `backend/src/exchanges/binance.ts`
- Modify: `backend/src/exchanges/okx.ts`
- Modify: `backend/package.json`（如需）

**Step 1: 调整代理默认行为**

- 只在环境变量显式配置时启用代理
- 服务器默认不再硬编码 `127.0.0.1:7890`

**Step 2: 修复服务器日志中的运行错误**

- 对齐 `createProxyAgent` 实际导出与调用处
- 确认 `npm run build` 后 `npm run start` 能稳定启动

**Step 3: 运行验证**

Run:
- `npm run build`
- `npm test -- --run src/network/proxy.test.ts src/services/kline.service.test.ts`

Expected:
- 构建通过
- 相关测试通过

### Task 4: 编写 SQLite -> PostgreSQL 迁移脚本

**Files:**
- Create: `backend/scripts/migrate-sqlite-to-postgres.ts`
- Modify: `backend/package.json`

**Step 1: 写失败路径检查**

- 迁移脚本启动时检查：
  - SQLite 文件存在
  - PostgreSQL 可连接
  - 目标表已初始化

**Step 2: 实现最小迁移逻辑**

- 从 SQLite 读取 `symbols`
- 从 SQLite 分批读取 `klines`
- 用 PostgreSQL upsert 写入
- 打印迁移数量与耗时

**Step 3: 运行脚本本地干跑或静态检查**

Run: `npm run build`

Expected:
- 脚本编译通过

### Task 5: 提交修复并推送远端

**Files:**
- Modify: 上述相关文件

**Step 1: 汇总变更**

Run:
- `git status --short`
- `git diff --stat`

**Step 2: 验证**

Run:
- `npm test -- --run src/database/postgres.test.ts src/services/kline.service.test.ts src/network/proxy.test.ts`
- `npm run build`

**Step 3: 提交并推送**

Run:
- `git add ...`
- `git commit -m "fix: 修复 PostgreSQL 迁移并补充服务器迁移脚本"`
- `git push origin codex/pg-migration-server`

### Task 6: 服务器备份与数据库初始化

**Files:**
- Server paths:
  - `/root/apps/quant-trading-system`
  - `/root/apps/quant-trading-system/backend/sqlite.db`

**Step 1: 备份**

- 备份当前代码目录
- 备份 `sqlite.db`
- 导出当前 PM2 配置

**Step 2: 初始化 PostgreSQL**

- 创建数据库与用户
- 授权
- 验证连接

**Step 3: 记录回滚命令**

- 保存旧 PM2 启动命令
- 保存旧代码备份路径

### Task 7: 服务器部署与数据迁移

**Files:**
- Server working tree at `/root/apps/quant-trading-system`

**Step 1: 拉取修复代码**

- `git fetch`
- `git checkout`
- `git pull`

**Step 2: 安装依赖并构建**

- `npm install` in `backend`
- `npm run build`

**Step 3: 执行数据迁移脚本**

- 从 SQLite 导入 PostgreSQL
- 检查导入数量

**Step 4: 切换 PM2**

- 删除 `npm run dev`
- 改为 `npm run start`

### Task 8: 验证与收尾

**Files:**
- Runtime endpoints:
  - `/api/health`
  - `/api/symbols`
  - `/api/klines`
  - WebSocket port

**Step 1: 验证接口**

- `curl /api/health`
- `curl /api/symbols`
- `curl /api/klines?...limit=2000`

**Step 2: 验证 PM2 与日志**

- `pm2 list`
- `pm2 logs --lines 100`

**Step 3: 记录结果**

- 数据库连接状态
- 迁移条数
- 服务运行状态
- 若失败，执行回滚
