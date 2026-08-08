# Worker Mailer

一个基于 Cloudflare Workers 构建的邮件发送服务，架构参考 bee-swarm 项目。支持 SMTP 配置、邮件模板、发送历史等功能。

## 技术栈

- **后端**: Hono + Cloudflare Workers + Cloudflare D1
- **前端**: Vue 3 + Vite + Pinia + Vue Router
- **数据库**: Cloudflare D1 (SQLite)

## 功能特性

- 用户注册/登录
- SMTP 配置管理
- 邮件模板管理
- 邮件发送（支持同步/异步）
- 发送历史查看
- 统计面板

## 本地开发

### 前置要求

- Node.js 18+
- npm 或 pnpm
- Wrangler CLI

### 安装依赖

```bash
npm install
```

### 设置环境变量

复制 `.dev.vars.example` 为 `.dev.vars` 并填入配置：

```bash
cp .dev.vars.example .dev.vars
```

**必填项：** `ENCRYPTION_KEY` — 用于 SMTP 密码、OAuth 密钥等敏感数据的加密存储。生产环境请使用 `wrangler secret put ENCRYPTION_KEY` 设置。

### 设置数据库

```bash
# 创建 D1 数据库
npx wrangler d1 create worker-mailer-db

# 执行迁移
npx wrangler d1 migrations apply worker-mailer-db --local
```

### 启动开发服务器

```bash
# 启动 Worker 后端 (终端1)
npm run dev:worker

# 启动 Vite 前端 (终端2)
npm run dev
```

访问 http://localhost:5173 查看应用

## 部署

### 1. 设置 Cloudflare

```bash
# 登录 Cloudflare
npx wrangler login

# 创建 D1 数据库 (如果尚未创建)
npx wrangler d1 create worker-mailer-db
```

### 2. 更新 wrangler.toml

将创建数据库时输出的 database_id 填入 wrangler.toml

### 3. 执行数据库迁移

```bash
npx wrangler d1 migrations apply worker-mailer-db
```

### 4. 部署

```bash
npm run deploy
```

## 项目结构

```
.
├── migrations/          # 数据库迁移文件
├── src/                 # Worker 后端代码
│   ├── db/              # 数据库初始化
│   ├── middleware/       # 中间件（auth, admin）
│   ├── routes/          # API 路由（auth/smtp/templates/emails/settings/user/misc）
│   ├── services/        # 业务服务
│   ├── utils/           # 工具函数（crypto, password）
│   ├── index.ts         # 入口文件
│   └── ...
├── types/               # 共享类型
├── web/                 # Vue 前端
│   ├── src/
│   │   ├── components/  # 组件
│   │   ├── views/       # 页面
│   │   ├── stores/      # Pinia 存储
│   │   ├── router.ts    # 路由配置
│   │   ├── api.ts       # API 客户端
│   │   └── main.ts      # 入口
│   └── index.html
├── dist/                # 构建输出
├── wrangler.toml        # Wrangler 配置
├── vite.config.ts       # Vite 配置
├── tsconfig.json        # TypeScript 配置
└── package.json
```

## API 文档

### 认证

- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录
- `POST /api/auth/refresh` - 刷新 Token
- `GET /api/auth/me` - 获取当前用户信息

### SMTP 配置

- `GET /api/smtp-configs` - 获取配置列表
- `POST /api/smtp-configs` - 创建配置
- `GET /api/smtp-configs/:id` - 获取单个配置
- `PUT /api/smtp-configs/:id` - 更新配置
- `DELETE /api/smtp-configs/:id` - 删除配置

### 邮件模板

- `GET /api/templates` - 获取模板列表
- `POST /api/templates` - 创建模板
- `GET /api/templates/:id` - 获取单个模板
- `PUT /api/templates/:id` - 更新模板
- `DELETE /api/templates/:id` - 删除模板

### 邮件发送

- `POST /api/emails` - 发送邮件
- `GET /api/emails` - 获取发送历史
- `GET /api/emails/:id` - 获取单条记录

### 统计

- `GET /api/metrics` - 获取统计数据

### API Key

- `POST /api/api-key/generate` - 生成 API Key（用于脚本/服务调用）

## 许可证

MIT
