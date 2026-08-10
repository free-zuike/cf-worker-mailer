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
else
  echo "ENCRYPTION_KEY 未设置，跳过（部署后需手动设置）"
fi

echo ""
echo "=== 设置完成 ==="
echo "下一步: 运行 npm run deploy 部署"