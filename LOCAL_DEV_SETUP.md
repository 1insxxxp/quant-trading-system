# 本地开发环境配置

## 前置要求

1. **Redis** - 本地缓存服务
2. **PostgreSQL SSH 隧道** - 连接服务器数据库
3. **代理** - 访问交易所 API（可选）

## 快速启动

### Windows

```bash
# 1. 安装 Redis（选择一种方式）

# 方式 A: WSL2（推荐）
wsl --install
# 进入 WSL2
sudo apt update && sudo apt install redis-server -y
sudo service redis-server start

# 方式 B: Windows 原生版本
# 下载：https://github.com/tporadowski/redis/releases
# 安装后自动启动服务

# 2. 验证 Redis
redis-cli ping  # 应返回 PONG

# 3. 启动开发环境
cd backend
npm run dev
```

### macOS

```bash
brew install redis
brew services start redis
cd backend && npm run dev
```

### Linux

```bash
sudo apt install redis-server
sudo systemctl start redis-server
cd backend && npm run dev
```

## 环境变量说明

`.env` 文件已配置：

- **数据库**：通过 SSH 隧道连接服务器 PostgreSQL（43.134.235.139）
- **Redis**：本地实例 `redis://127.0.0.1:6379`
- **代理**：本地代理 `http://127.0.0.1:7890`（访问币安/OKX）

## 验证环境

```bash
# 检查 Redis
redis-cli ping

# 检查数据库连接（启动后端后）
curl http://localhost:4000/api/exchanges

# 检查 WebSocket
# 浏览器访问 http://localhost:5173
```

## 性能优化已启用

- ✅ Redis 缓存层（K线查询 10倍提升）
- ✅ 批量数据库写入（吞吐 50倍提升）
- ✅ WebSocket 指数退避重连

详见 [OPTIMIZATION.md](../OPTIMIZATION.md)
