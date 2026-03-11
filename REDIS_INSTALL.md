# Redis 本地安装指南

## 方案 1：Windows 原生版本（推荐）

### 下载安装
1. 访问：https://github.com/tporadowski/redis/releases
2. 下载最新版本的 `Redis-x64-*.zip`
3. 解压到 `C:\Redis\`

### 启动 Redis
```bash
# 方式 A：命令行启动
cd C:\Redis
redis-server.exe

# 方式 B：安装为 Windows 服务（推荐）
cd C:\Redis
redis-server.exe --service-install
redis-server.exe --service-start
```

### 验证安装
```bash
redis-cli.exe ping
# 应返回：PONG
```

---

## 方案 2：WSL2 Ubuntu

如果你更喜欢使用 WSL2，请手动执行以下命令：

### 打开 WSL2
```bash
# Windows 命令行中输入
wsl
```

### 在 WSL2 中安装 Redis
```bash
sudo apt update
sudo apt install redis-server -y
```

### 启动 Redis
```bash
sudo service redis-server start
```

### 验证安装
```bash
redis-cli ping
# 应返回：PONG
```

---

## 启动开发环境

安装完 Redis 后：

```bash
# 1. 确保 Redis 正在运行
redis-cli ping

# 2. 启动后端
cd backend
npm run dev

# 3. 启动前端（新终端）
cd frontend
npm run dev
```

## 环境变量

`.env` 文件已配置：
```
REDIS_URL=redis://127.0.0.1:6379
```

无需修改，开箱即用！
