# Worker Mailer

一个基于 Cloudflare Workers 构建的**邮件服务系统**，支持邮件发送、多邮箱收件箱管理，可作为 Resend / SendGrid 的自托管替代方案。

## 技术栈

- **后端**: Hono + Cloudflare Workers + Cloudflare D1
- **前端**: Vue 3 + Soybean Admin + Naive UI + wangEditor
- **数据库**: Cloudflare D1 (SQLite)
- **存储**: Cloudflare R2 (图片/附件上传)
- **队列**: Cloudflare Queues (异步邮件同步)
- **IMAP**: cf-imap (第三方邮箱收件)

## 功能特性

### 邮件发送
- 用户注册/登录（邮箱+密码、GitHub OAuth）
- SMTP 配置管理（支持 SMTP 和 MailChannels）
- 发件配置集成 IMAP 收件设置（同一账号密码）
- 邮件模板管理（支持变量替换）
- 富文本编辑器（wangEditor，支持图片上传到 R2）
- 发送 HTML / 纯文本 / 附件
- 发送历史 + 失败重试
- 全局变量管理（`{{name}}` 自动替换，`{{{{name}}}}` 保留原文）
- 双括号逃逸语法（`{{{{name}}}}` → `{{name}}` 不替换）

### 收件箱
- 第三方邮箱 IMAP 收件（QQ邮箱、Gmail、Outlook 等）
- 文件夹分类（收件箱、已发送、草稿箱、垃圾箱、已删除）
- 自动同步（每 2 分钟自动收取新邮件）
- 增量同步（只拉取新邮件，不重复扫描）
- 按需加载正文（同步只拉取头部，查看时按需获取正文并缓存）
- 已读/未读双向同步（同步到 IMAP 服务器）
- 邮件搜索（主题/发件人/收件人）
- 分页浏览
- 星标标记
- 回复 / 转发（自动跳转到发送页面）
- 附件下载
- 手动标记已读/未读

### 其他
- 联系人管理
- 统计面板
- 管理员系统设置
- 多语言支持（中/英）
- 暗色/亮色主题切换

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

### 一键部署（GitHub Actions，推荐）

1. Fork 这个仓库到你的 GitHub

2. 在 GitHub 仓库设置中添加以下 Secrets（Settings → Secrets and variables → Actions）：

   | Secret | 说明 |
   |--------|------|
   | `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（权限：Workers、D1、R2、Queues） |
   | `ENCRYPTION_KEY` | **加密密钥（必填！）** 生成方法：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

   > `CLOUDFLARE_ACCOUNT_ID` 可选，如果 API Token 只绑定一个账户，wrangler 会自动识别。

3. 推送到 `main` 分支，GitHub Actions 会自动：
   - 创建 D1 数据库、R2 存储桶、队列
   - 设置 `ENCRYPTION_KEY`
   - 构建前端
   - 部署 Worker

### 手动部署

如果不想用 GitHub Actions，也可以手动部署：

```bash
# 1. 登录 Cloudflare
npx wrangler login

# 2. 创建资源
npx wrangler d1 create worker-mailer-db
npx wrangler r2 bucket create worker-mailer-uploads
npx wrangler queues create mailer-queue

# 3. 将 D1 输出的 database_id 填入 wrangler.toml

# 4. 设置加密密钥（必填）
npx wrangler secret put ENCRYPTION_KEY

# 5. 构建并部署
npm run build
npx wrangler deploy
```

## 项目结构

```
.
├── migrations/              # 数据库迁移文件
├── src/                     # Worker 后端代码
│   ├── db/                  # 数据库初始化
│   ├── middleware/           # 中间件（auth, admin, rateLimit）
│   ├── routes/              # API 路由
│   │   ├── api.ts           # 路由聚合
│   │   ├── auth.ts          # 认证
│   │   ├── contacts.ts      # 联系人
│   │   ├── emails.ts        # 邮件发送
│   │   ├── inbox.ts         # 收件箱
│   │   ├── misc.ts          # 统计/API Key
│   │   ├── settings.ts      # 系统设置
│   │   ├── smtp.ts          # 发件配置
│   │   ├── templates.ts     # 邮件模板
│   │   ├── upload.ts        # 文件上传
│   │   ├── user.ts          # 用户偏好
│   │   └── variables.ts     # 全局变量
│   ├── services/            # 业务服务
│   │   ├── emailService.ts        # 邮件发送
│   │   ├── inboxService.ts        # 收件箱同步
│   │   ├── smtpService.ts         # 发件配置
│   │   ├── templateService.ts     # 模板+变量替换
│   │   ├── globalVariableService.ts # 全局变量
│   │   ├── contactService.ts      # 联系人
│   │   ├── captchaService.ts      # 人机验证
│   │   ├── settingsService.ts     # 系统设置
│   │   ├── userService.ts         # 用户
│   │   ├── preferencesService.ts  # 用户偏好
│   │   └── githubOAuthService.ts  # GitHub OAuth
│   ├── utils/               # 工具函数（crypto, password）
│   ├── index.ts             # 入口文件
│   └── ...
├── types/                   # 共享类型
├── web/                     # Vue 前端 (Soybean Admin)
│   ├── src/
│   │   ├── views/           # 页面
│   │   │   ├── inbox/           # 收件箱
│   │   │   ├── compose/         # 发送邮件
│   │   │   ├── smtp/            # 发件配置
│   │   │   ├── templates/       # 邮件模板
│   │   │   ├── history/         # 发送历史
│   │   │   ├── contacts/        # 联系人
│   │   │   ├── global-variables/# 全局变量
│   │   │   ├── settings/        # 系统设置
│   │   │   └── ...
│   │   ├── components/      # 组件
│   │   ├── stores/          # Pinia 存储
│   │   ├── router/          # 路由配置
│   │   ├── service/         # API 客户端
│   │   └── main.ts          # 入口
│   └── index.html
├── dist/                    # 前端构建输出
├── wrangler.toml            # Wrangler 配置
├── vite.config.ts           # Vite 配置
└── package.json
```

## API 文档

### 认证
- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录
- `POST /api/auth/refresh` - 刷新 Token
- `GET /api/auth/me` - 获取当前用户信息

### 发件配置
- `GET /api/smtp-configs` - 获取配置列表
- `POST /api/smtp-configs` - 创建配置
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
- `POST /api/emails/:id/retry` - 重试发送失败邮件

### 收件箱
- `GET /api/inbox/configs` - 获取支持 IMAP 的发件配置
- `POST /api/inbox/sync/:configId` - 异步同步邮件（队列）
- `GET /api/inbox/folders/:configId` - 获取文件夹列表
- `GET /api/inbox/emails/:configId` - 获取邮件列表（支持文件夹筛选）
- `GET /api/inbox/email/:id` - 获取邮件详情
- `GET /api/inbox/email/:id/full` - 获取邮件正文（按需拉取）
- `POST /api/inbox/email/:id/read` - 标记已读
- `POST /api/inbox/email/:id/unread` - 标记未读
- `POST /api/inbox/email/:id/star` - 星标/取消星标
- `DELETE /api/inbox/email/:id` - 删除邮件
- `GET /api/inbox/search/:configId` - 搜索邮件
- `GET /api/inbox/attachment/:emailId/:index` - 下载附件

### 全局变量
- `GET /api/variables` - 获取变量列表
- `POST /api/variables` - 创建变量
- `PUT /api/variables/:id` - 更新变量
- `DELETE /api/variables/:id` - 删除变量

### 联系人
- `GET /api/contacts` - 获取联系人列表
- `POST /api/contacts` - 创建联系人
- `PUT /api/contacts/:id` - 更新联系人
- `DELETE /api/contacts/:id` - 删除联系人

### 统计
- `GET /api/metrics` - 获取统计数据
- `POST /api/api-key/generate` - 生成 API Key

## MCP Server（AI 模型调用）

本服务实现了 **MCP (Model Context Protocol)** 协议（完整实现），AI 模型（如 Claude、Cursor 等）可以通过 MCP 调用邮件服务。

**双协议兼容：**
| 协议版本 | 说明 |
|---------|------|
| `2025-11-25` | 兼容 SDK ≤1.30 的客户端，通过 `initialize` 握手协商版本 |
| `2026-07-28` | 无状态（stateless）协议，每个请求通过 `_meta` 传递版本和能力 |

服务器自动检测客户端使用的协议版本，两种客户端均能正常工作。

### 实现的功能

| MCP 功能 | 状态 |
|---------|------|
| **Tools**（工具） | ✅ `tools/list` + `tools/call`，10 个工具 |
| **Resources**（资源） | ✅ `resources/list` + `resources/templates/list` + `resources/read` |
| **Prompts**（提示） | ✅ `prompts/list` + `prompts/get`，3 个邮件提示模板 |
| **Completions**（补全） | ✅ `completion/complete`，参数自动补全 |
| **Elicitation**（用户追问） | ✅ MRTR 模式：缺发件配置时返回表单让用户选择 |
| **Ping** | ✅ 心跳检测 |
| **Subscriptions**（订阅） | ✅ `subscriptions/listen` + SSE 流 (GET /) |
| **Notifications** | ✅ 资源/工具列表变更通知推送 |
| **Cancellation** | ✅ `notifications/cancelled` |
| **Version Negotiation** | ✅ `initialize` + `server/discover` |

### 可用工具

| 工具名 | 说明 |
|--------|------|
| `send_email` | 发送邮件 |
| `list_inbox` | 查看收件箱 |
| `search_emails` | 搜索邮件 |
| `get_email` | 获取邮件详情 |
| `list_smtp_configs` | 获取发件配置 |
| `list_templates` | 获取邮件模板 |
| `list_inbox_configs` | 获取支持 IMAP 的配置 |
| `list_email_history` | 获取发送历史 |
| `retry_email` | 重试发送失败的邮件 |
| `get_metrics` | 获取邮件统计数据 |

### 可用资源

| URI 模板 | 说明 |
|----------|------|
| `mailer://email/{id}` | 已发送邮件详情 |
| `mailer://template/{id}` | 邮件模板内容 |
| `mailer://smtp/{id}` | 发件配置信息 |
| `mailer://inbox/{configId}/{emailId}` | 收件箱邮件 |

### 可用提示模板

| 名称 | 说明 |
|------|------|
| `compose-email` | 撰写新邮件 |
| `reply-email` | 回复邮件 |
| `search-email` | 搜索并总结邮件 |

### 使用方式

1. 先生成 API Key：
```bash
curl -X POST https://zuike.cc.cd/api/api-key/generate \
  -H "Authorization: Bearer <你的登录token>"
```

2. 配置 MCP 客户端（如 Claude Desktop）：
```json
{
  "mcpServers": {
    "cf-worker-mailer": {
      "url": "https://zuike.cc.cd/mcp",
      "headers": {
        "Authorization": "Bearer <你的API Key>"
      }
    }
  }
}
```

### 请求示例

**旧协议初始化握手（SDK ≤1.30 客户端自动执行）：**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {},
    "clientInfo": { "name": "mcp-client", "version": "1.0.0" }
  }
}
```

**新协议发现服务器能力（2026-07-28）：**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "server/discover",
  "params": {}
}
```

**列出工具（新协议需携带 `_meta`）：**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

**响应格式（新旧协议一致）：**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "resultType": "complete",
    "tools": [],
    "_meta": {
      "io.modelcontextprotocol/serverInfo": {
        "name": "cf-worker-mailer-mcp",
        "version": "1.0.0"
      }
    }
  }
}
```

**调用工具（旧协议：不带 `_meta`，新协议：带 `_meta`）：**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "list_smtp_configs",
    "arguments": {}
  }
}
```

工具执行出错时返回 `isError: true` 的结果（而非 JSON-RPC 错误），便于 AI 模型根据错误信息自我纠正后重试。

### Elicitation（向用户追问）

当调用 `send_email` / `list_inbox` / `search_emails` 未提供 `configId` 且客户端支持 `elicitation.form` 时，服务器会返回 `input_required` 结果，弹出发件配置选择表单（MRTR 多轮往返）：

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "resultType": "input_required",
    "inputRequests": {
      "config_selection": {
        "method": "elicitation/create",
        "params": {
          "mode": "form",
          "message": "需要选择一个发件配置来继续，请选择：",
          "requestedSchema": {
            "type": "object",
            "properties": {
              "configId": {
                "type": "string",
                "oneOf": [{ "const": "config-id-1", "title": "配置1 <a@b.com>" }]
              }
            },
            "required": ["configId"]
          }
        }
      }
    },
    "requestState": "{...}"
  }
}
```

客户端重试时携带 `inputResponses` 提交用户选择：

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "send_email",
    "arguments": { "to": "...", "subject": "..." },
    "inputResponses": {
      "config_selection": {
        "action": "accept",
        "content": { "configId": "config-id-1" }
      }
    }
  }
}
```

### 变量替换语法

| 写法 | 效果 |
|------|------|
| `{{name}}` | 替换为变量值（如 `zuike`） |
| `{{{{name}}}}` | 保留为 `{{name}}` 原文（不替换） |

每多一对 `{{` 和 `}}`，输出就多保留一对括号。

## 许可证

MIT