#!/bin/bash
# 自动创建 Cloudflare 资源并更新 wrangler.toml
# 用法: CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=xxx bash scripts/setup.sh

set -e

echo "=== 1. 创建 D1 数据库 ==="
D1_OUTPUT=$(npx wrangler d1 create worker-mailer-db 2>&1) || true
D1_ID=$(echo "$D1_OUTPUT" | grep -oP 'database_id = "\K[^"]+' || echo "")
if [ -z "$D1_ID" ]; then
  # 已存在，获取 ID
  D1_ID=$(npx wrangler d1 list 2>/dev/null | grep worker-mailer-db | awk '{print $2}' || echo "")
fi
echo "D1 ID: $D1_ID"

echo "=== 2. 创建 R2 存储桶 ==="
npx wrangler r2 bucket create worker-mailer-uploads 2>/dev/null || echo "R2 已存在"

echo "=== 3. 创建队列 ==="
npx wrangler queues create mailer-queue 2>/dev/null || echo "队列已存在"

echo "=== 4. 更新 wrangler.toml ==="
if [ -n "$D1_ID" ]; then
  # 用 sed 替换 database_id
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s/database_id = \".*\"/database_id = \"$D1_ID\"/" wrangler.toml
  else
    sed -i "s/database_id = \".*\"/database_id = \"$D1_ID\"/" wrangler.toml
  fi
  echo "wrangler.toml 已更新，database_id = $D1_ID"
else
  echo "警告: 无法获取 D1 database ID，请手动设置"
fi

echo "=== 5. 设置 ENCRYPTION_KEY ==="
if [ -n "$ENCRYPTION_KEY" ]; then
  echo "$ENCRYPTION_KEY" | npx wrangler secret put ENCRYPTION_KEY 2>/dev/null || echo "ENCRYPTION_KEY 已设置或跳过"
  echo "ENCRYPTION_KEY 已使用你提供的值"
else
  # 自动生成随机密钥
  AUTO_KEY=$(openssl rand -hex 32)
  echo "$AUTO_KEY" | npx wrangler secret put ENCRYPTION_KEY 2>/dev/null || echo "设置 ENCRYPTION_KEY 失败"
  echo ""
  echo "=============================================="
  echo "⚠️  已自动生成并设置 ENCRYPTION_KEY"
  echo "   请务必保存下面这个密钥，丢失后无法解密已保存的密码："
  echo ""
  echo "    ENCRYPTION_KEY = $AUTO_KEY"
  echo ""
  echo "   建议复制到密码管理器或本地文件中保存"
  echo "=============================================="
fi

echo ""
echo "=== 设置完成 ==="
echo "下一步: 运行 npm run deploy 部署"