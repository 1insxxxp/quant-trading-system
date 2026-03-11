#!/bin/bash
# Redis 安装脚本 for WSL2

echo "开始安装 Redis..."

# 更新包列表
sudo apt update

# 安装 Redis
sudo apt install redis-server -y

# 验证安装
redis-server --version

echo ""
echo "✅ Redis 安装完成！"
echo ""
echo "启动 Redis："
echo "  sudo service redis-server start"
echo ""
echo "验证 Redis："
echo "  redis-cli ping"
echo ""
