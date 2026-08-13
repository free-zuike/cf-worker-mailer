import { Hono } from 'hono';
import type { Env } from '../../types';
import { EmailService } from '../services/emailService';
import { InboxService } from '../services/inboxService';
import { TemplateService } from '../services/templateService';
import { SmtpService } from '../services/smtpService';
import { UserService } from '../services/userService';

/**
 * MCP (Model Context Protocol) Server — 完整实现
 * 协议版本: 2025-11-25 (旧握手) + 2026-07-28 (无状态)
 * 功能: Tools | Resources | Prompts | Completions | Ping | Subscriptions
 */

const SUPPORTED_PROTOCOL_VERSIONS = ['2026-07-28', '2025-11-25'];
const DEFAULT_PROTOCOL_VERSION = '2025-11-25';

const SERVER_INFO = {
  name: 'cf-worker-mailer-mcp',
  version: '1.0.0',
};

// ============================================================
// 助手函数
// ============================================================

async function getUserByApiKey(env: Env, apiKey: string) {
  if (!apiKey) return null;
  return new UserService(env).getUserByApiKey(apiKey);
}

// ============================================================
// 工具定义 (Tools)
// ============================================================

const TOOLS = [
  {
    name: 'send_email',
    description: '发送邮件。发件人使用发件配置中的邮箱，无需额外指定。需要先通过 list_smtp_configs 获取发件配置 ID。',
    inputSchema: {
      type: 'object',
      properties: {
        configId: { type: 'string', description: '发件配置 ID（通过 list_smtp_configs 获取）' },
        to: { type: 'string', description: '收件人邮箱，多个用逗号分隔' },
        subject: { type: 'string', description: '邮件主题' },
        html: { type: 'string', description: 'HTML 内容（可选，与 text 二选一）' },
        text: { type: 'string', description: '纯文本内容（可选，与 html 二选一）' },
        cc: { type: 'string', description: '抄送，多个用逗号分隔（可选）' },
      },
      required: ['configId', 'to', 'subject'],
    },
  },
  {
    name: 'list_inbox',
    description: '查看收件箱邮件列表。需要 configId(发件配置 ID，需配置了 IMAP)。可选 folder 和 page。',
    inputSchema: {
      type: 'object',
      properties: {
        configId: { type: 'string', description: '发件配置 ID' },
        folder: { type: 'string', description: '文件夹，默认 INBOX' },
        page: { type: 'number', description: '页码，默认 1' },
      },
      required: ['configId'],
    },
  },
  {
    name: 'search_emails',
    description: '搜索收件箱邮件。需要 configId 和 q(搜索关键词)。',
    inputSchema: {
      type: 'object',
      properties: {
        configId: { type: 'string', description: '发件配置 ID' },
        q: { type: 'string', description: '搜索关键词（主题/发件人/收件人）' },
      },
      required: ['configId', 'q'],
    },
  },
  {
    name: 'get_email',
    description: '获取邮件详情。需要 emailId。',
    inputSchema: {
      type: 'object',
      properties: { emailId: { type: 'string', description: '邮件 ID' } },
      required: ['emailId'],
    },
  },
  {
    name: 'list_smtp_configs',
    description: '获取发件配置列表。',
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'list_templates',
    description: '获取邮件模板列表。',
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'list_inbox_configs',
    description: '获取支持 IMAP 收件的发件配置。',
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'list_email_history',
    description: '获取邮件发送历史列表。',
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'retry_email',
    description: '重试发送失败的邮件。需要 emailId。',
    inputSchema: {
      type: 'object',
      properties: { emailId: { type: 'string', description: '邮件 ID' } },
      required: ['emailId'],
    },
  },
  {
    name: 'get_metrics',
    description: '获取邮件统计数据（总发送量、成功、失败、待处理数量）。',
    inputSchema: { type: 'object', additionalProperties: false },
  },
];

// ============================================================
// 资源定义 (Resources)
// ============================================================

const RESOURCE_TEMPLATES = [
  {
    name: 'Email History',
    uriTemplate: 'mailer://email/{id}',
    description: '一封已发送的邮件详情',
    mimeType: 'application/json',
  },
  {
    name: 'Email Template',
    uriTemplate: 'mailer://template/{id}',
    description: '一个邮件模板的详细内容',
    mimeType: 'application/json',
  },
  {
    name: 'SMTP Config',
    uriTemplate: 'mailer://smtp/{id}',
    description: '一个发件配置的详细信息',
    mimeType: 'application/json',
  },
  {
    name: 'Inbox Email',
    uriTemplate: 'mailer://inbox/{configId}/{emailId}',
    description: '收件箱中的一封邮件',
    mimeType: 'application/json',
  },
];

// 列出所有静态资源
async function listResources(userId: string, env: Env) {
  const smtpService = new SmtpService(env, userId);
  const templateService = new TemplateService(env, userId);
  const emailService = new EmailService(env, userId);
  const [configs, templates, emails] = await Promise.all([
    smtpService.findAll(),
    templateService.list(),
    emailService.listHistory(20, 0),
  ]);
  return [
    ...configs.map(c => ({
      uri: `mailer://smtp/${c.id}`,
      name: c.name,
      description: `SMTP 配置: ${c.host}`,
      mimeType: 'application/json' as const,
    })),
    ...templates.map(t => ({
      uri: `mailer://template/${t.id}`,
      name: t.name,
      description: `邮件模板: ${t.subject}`,
      mimeType: 'application/json' as const,
    })),
    ...emails.map(e => ({
      uri: `mailer://email/${e.id}`,
      name: e.subject,
      description: `发送至 ${e.toEmails.join(', ')}`,
      mimeType: 'application/json' as const,
    })),
  ];
}

// 读取指定资源
async function readResource(uri: string, userId: string, env: Env) {
  const matchEmail = uri.match(/^mailer:\/\/email\/(.+)$/);
  if (matchEmail) {
    const svc = new EmailService(env, userId);
    const email = await svc.getHistory(matchEmail[1]);
    if (!email) return null;
    return { text: JSON.stringify(email, null, 2), mimeType: 'application/json' };
  }

  const matchTemplate = uri.match(/^mailer:\/\/template\/(.+)$/);
  if (matchTemplate) {
    const svc = new TemplateService(env, userId);
    const template = await svc.get(matchTemplate[1]);
    if (!template) return null;
    return { text: JSON.stringify(template, null, 2), mimeType: 'application/json' };
  }

  const matchSmtp = uri.match(/^mailer:\/\/smtp\/(.+)$/);
  if (matchSmtp) {
    const svc = new SmtpService(env, userId);
    const config = await svc.findById(matchSmtp[1]);
    if (!config) return null;
    return { text: JSON.stringify(config, null, 2), mimeType: 'application/json' };
  }

  const matchInbox = uri.match(/^mailer:\/\/inbox\/([^/]+)\/(.+)$/);
  if (matchInbox) {
    const svc = new InboxService(env, userId);
    const email = await svc.getEmail(matchInbox[2]);
    if (!email) return null;
    return { text: JSON.stringify(email, null, 2), mimeType: 'application/json' };
  }

  return null;
}

// ============================================================
// 提示定义 (Prompts)
// ============================================================

const PROMPTS = [
  {
    name: 'compose-email',
    description: '撰写一封新邮件',
    arguments: [
      { name: 'to', description: '收件人邮箱', required: true },
      { name: 'subject', description: '邮件主题', required: true },
      { name: 'context', description: '邮件内容背景信息', required: true },
    ],
  },
  {
    name: 'reply-email',
    description: '回复一封收到的邮件',
    arguments: [
      { name: 'originalEmail', description: '原始邮件内容', required: true },
      { name: 'replyContext', description: '回复的补充说明', required: false },
    ],
  },
  {
    name: 'search-email',
    description: '搜索邮件并总结结果',
    arguments: [
      { name: 'query', description: '搜索关键词', required: true },
      { name: 'configId', description: '发件配置 ID', required: true },
    ],
  },
];

// ============================================================
// 工具调用处理
// ============================================================

// 工具调用结果：needElicitConfig 表示缺发件配置，可触发 elicitation 交互
interface ToolResult {
  text: string;
  isError: boolean;
  needElicitConfig?: boolean;
}

async function handleToolCall(toolName: string, args: Record<string, unknown>, userId: string, env: Env): Promise<ToolResult | null> {
  switch (toolName) {
    case 'send_email': {
      const toArr = String(args.to || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!toArr.length) return { isError: true, text: '收件人不能为空' };
      if (!args.configId) return { isError: true, text: '缺少 configId，请选择发件配置', needElicitConfig: true };
      const emailService = new EmailService(env, userId);
      const result = await emailService.sendEmail({
        to: toArr,
        subject: String(args.subject || ''),
        html: args.html ? String(args.html) : undefined,
        text: args.text ? String(args.text) : undefined,
        configId: String(args.configId),
        cc: args.cc ? String(args.cc).split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
      });
      // 通知资源列表变更
      Promise.resolve().then(() => {
        broadcastSSE('notifications/resources/list_changed', '{}', userId);
      });
      return { text: `邮件已发送，ID: ${result.id}，状态: ${result.status}`, isError: false };
    }

    case 'list_inbox': {
      if (!args.configId) return { isError: true, text: '缺少 configId，请选择发件配置', needElicitConfig: true };
      const svc = new InboxService(env, userId);
      const result = await svc.listEmails(String(args.configId), String(args.folder || 'INBOX'), Number(args.page || 1), 20);
      return { text: JSON.stringify(result), isError: false };
    }

    case 'search_emails': {
      if (!args.configId) return { isError: true, text: '缺少 configId，请选择发件配置', needElicitConfig: true };
      if (!args.q) return { isError: true, text: '缺少搜索关键词 q' };
      const svc = new InboxService(env, userId);
      const result = await svc.searchEmails(String(args.configId), String(args.q));
      return { text: JSON.stringify(result), isError: false };
    }

    case 'get_email': {
      const inboxService = new InboxService(env, userId);
      const email = await inboxService.getEmail(String(args.emailId || ''));
      if (!email) return { isError: true, text: '邮件不存在' };
      return { text: JSON.stringify({ email }), isError: false };
    }

    case 'list_smtp_configs': {
      const smtpService = new SmtpService(env, userId);
      const configs = await smtpService.findAll();
      return { text: JSON.stringify({ configs }), isError: false };
    }

    case 'list_templates': {
      const templateService = new TemplateService(env, userId);
      const templates = await templateService.list();
      return { text: JSON.stringify({ templates }), isError: false };
    }

    case 'list_inbox_configs': {
      const inboxService = new InboxService(env, userId);
      const configs = await inboxService.getImapEnabledConfigs();
      return { text: JSON.stringify({ configs }), isError: false };
    }

    case 'list_email_history': {
      const emailService = new EmailService(env, userId);
      const history = await emailService.listHistory(50, 0);
      return { text: JSON.stringify({ history }), isError: false };
    }

    case 'retry_email': {
      if (!args.emailId) return { isError: true, text: '缺少 emailId' };
      const emailService = new EmailService(env, userId);
      await emailService.retryFailedEmail(String(args.emailId));
      Promise.resolve().then(() => {
        broadcastSSE('notifications/resources/list_changed', '{}', userId);
      });
      return { text: `已重试邮件 ${args.emailId}`, isError: false };
    }

    case 'get_metrics': {
      const emailService = new EmailService(env, userId);
      const metrics = await emailService.getMetrics();
      return { text: JSON.stringify({ metrics }), isError: false };
    }

    default:
      return null; // 未知工具，由 caller 处理
  }
}

// ============================================================
// 搜索 & 补全 (Completions)
// ============================================================

async function completeArgument(ref: any, argument: { name: string; value: string }, userId: string, env: Env) {
  // 补全 SMTP 配置名称
  if (argument.name === 'configId') {
    const smtpService = new SmtpService(env, userId);
    const configs = await smtpService.findAll();
    const values = configs
      .map(c => c.id)
      .filter(id => id.includes(argument.value));
    return { values: values.slice(0, 20), total: values.length, hasMore: values.length > 20 };
  }

  // 补全模板名称
  if (argument.name === 'templateId') {
    const templateService = new TemplateService(env, userId);
    const templates = await templateService.list();
    const values = templates
      .map(t => t.id)
      .filter(id => id.includes(argument.value));
    return { values: values.slice(0, 20), total: values.length, hasMore: values.length > 20 };
  }

  // 补全文件夹名称
  if (argument.name === 'folder') {
    const folders = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'ARCHIVE'];
    const values = folders.filter(f => f.toLowerCase().includes(argument.value.toLowerCase()));
    return { values: values.slice(0, 20), total: values.length };
  }

  // 补全 prompt 参数
  if (argument.name === 'query') {
    return { values: [] };
  }

  return { values: [], total: 0 };
}

// ============================================================
// Elicitation（向用户追问信息，MRTR 模式）
// ============================================================

// 构造发件配置选择表单（elicitation/create 请求）
async function buildConfigElicitation(userId: string, env: Env) {
  const smtpService = new SmtpService(env, userId);
  const configs = await smtpService.findAll();
  if (!configs.length) return null;
  return {
    method: 'elicitation/create',
    params: {
      mode: 'form' as const,
      message: '需要选择一个发件配置来继续，请选择：',
      requestedSchema: {
        type: 'object' as const,
        properties: {
          configId: {
            type: 'string' as const,
            title: '发件配置',
            description: '选择用于发送邮件的发件配置',
            oneOf: configs.map(c => ({ const: c.id, title: `${c.name} <${c.fromEmail}>` })),
          },
        },
        required: ['configId'],
      },
    },
  };
}

// 从重试请求的 inputResponses 中提取提交的表单数据
function extractInputResponses(inputResponses: any): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  if (!inputResponses || typeof inputResponses !== 'object') return merged;
  for (const value of Object.values(inputResponses) as any[]) {
    const resp = value as { action?: string; content?: Record<string, unknown> };
    if (resp.action === 'accept' && resp.content && typeof resp.content === 'object') {
      Object.assign(merged, resp.content);
    }
  }
  return merged;
}

// ============================================================
// SSE 流管理 (Subscriptions)
// ============================================================

interface SSEClient {
  writer: WritableStreamDefaultWriter<Uint8Array>;
  userId: string | null;
  filter: { toolsListChanged?: boolean; promptsListChanged?: boolean; resourcesListChanged?: boolean };
}

const sseClients = new Map<string, SSEClient>();

function broadcastSSE(event: string, data: string, userId?: string) {
  const msg = `event: ${event}\ndata: ${data}\n\n`;
  const encoded = new TextEncoder().encode(msg);
  for (const [id, client] of sseClients) {
    if (userId && client.userId !== userId) continue;
    client.writer.write(encoded).catch(() => sseClients.delete(id));
  }
}

// 资源/工具列表变更时通知订阅者
function notifyListChanged(userId: string) {
  for (const [id, client] of sseClients) {
    if (client.userId !== userId) continue;
    if (client.filter.resourcesListChanged) {
      broadcastSSE('notifications/resources/list_changed', '{}', userId);
    }
    if (client.filter.toolsListChanged) {
      broadcastSSE('notifications/tools/list_changed', '{}', userId);
    }
  }
}

// ============================================================
// Hono 路由
// ============================================================

const mcp = new Hono<{ Bindings: Env }>();

// SSE 订阅流 (GET)
mcp.get('/', async (c) => {
  const accept = c.req.header('Accept');
  // 非 SSE 请求返回 405（让 Streamable HTTP 客户端降级）
  if (accept !== 'text/event-stream') {
    return c.text('Method Not Allowed', 405);
  }

  const { readable, writable } = new TransformStream<Uint8Array>();
  const writer = writable.getWriter();
  const id = crypto.randomUUID();

  // 认证并关联用户（可选，SSE 流本身不强制认证）
  const authHeader = c.req.header('Authorization') || '';
  const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const user = await getUserByApiKey(c.env, apiKey);

  // 发送初始端点
  const endpointMsg = `event: endpoint\ndata: /\n\n`;
  await writer.write(new TextEncoder().encode(endpointMsg));

  sseClients.set(id, { writer, userId: user?.id ?? null, filter: {} });

  // 移除客户端断开连接时的引用
  c.req.raw.signal.addEventListener('abort', () => {
    sseClients.delete(id);
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

// 处理 MCP JSON-RPC 请求 (POST)
mcp.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null });
  }

  const { method, id, params } = body as any;
  const meta = params?._meta || {};

  const authHeader = c.req.header('Authorization') || '';
  const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const user = await getUserByApiKey(c.env, apiKey);

  const respond = (result: object) => c.json({
    jsonrpc: '2.0',
    result: { resultType: 'complete', ...result, _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO } },
    id,
  });

  const respondError = (code: number, message: string) => c.json({ jsonrpc: '2.0', error: { code, message }, id });

  // 验证协议版本（新协议客户端）
  function validateVersion() {
    const declaredVersion = meta['io.modelcontextprotocol/protocolVersion'];
    if (declaredVersion === undefined) return true; // 旧协议，跳过
    if (typeof declaredVersion !== 'string') return false;
    const headerVersion = c.req.header('MCP-Protocol-Version');
    if (headerVersion && headerVersion !== declaredVersion) throw { code: -32020, message: 'MCP-Protocol-Version header mismatch' };
    if (!SUPPORTED_PROTOCOL_VERSIONS.includes(declaredVersion)) throw { code: -32022, message: `Unsupported protocol version: ${declaredVersion}` };
    return true;
  }

  try {
    switch (method) {
      // ========== 基础协议 ==========

      case 'initialize': {
        const requestedVersion = params?.protocolVersion;
        const negotiated = SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)
          ? requestedVersion
          : DEFAULT_PROTOCOL_VERSION;
        return respond({
          protocolVersion: negotiated,
          capabilities: { tools: {}, resources: {}, prompts: {}, completions: {} },
          serverInfo: SERVER_INFO,
          instructions: '邮件发送服务。支持发送邮件、管理收件箱、搜索邮件、管理模板和发件配置。',
        });
      }

      case 'notifications/initialized':
        return c.json({ jsonrpc: '2.0', result: null, id });

      case 'server/discover':
        return respond({
          supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
          capabilities: { tools: {}, resources: {}, prompts: {}, completions: {} },
          instructions: '邮件发送服务。支持发送邮件、管理收件箱、搜索邮件、管理模板和发件配置。',
          ttlMs: 300000,
          cacheScope: 'public' as const,
        });

      case 'ping':
        return respond({});

      case 'notifications/cancelled':
        // 取消请求通知，无需响应
        return c.json({ jsonrpc: '2.0', result: null, id });

      // ========== 工具 (Tools) ==========

      case 'tools/list':
        return respond({ tools: TOOLS, ttlMs: 300000, cacheScope: 'public' as const });

      case 'tools/call': {
        validateVersion();
        if (!user) return respondError(401, 'Unauthorized: 请提供有效的 API Key');
        const toolName = params?.name;

        // MRTR 重试：合并 inputResponses 中用户提交的表单数据到参数
        const elicitationData = extractInputResponses(params?.inputResponses);
        const args = { ...(params?.arguments || {}), ...elicitationData };

        const result = await handleToolCall(toolName, args, user.id, c.env);
        if (result === null) return respondError(-32602, `Unknown tool: ${toolName}`);

        // 需要用户在表单中选择发件配置（Elicitation）
        if (result.needElicitConfig) {
          // 仅当客户端声明支持 elicitation.form 时才发起交互
          const clientCaps = meta['io.modelcontextprotocol/clientCapabilities'] || {};
          if (clientCaps.elicitation?.form) {
            const elicit = await buildConfigElicitation(user.id, c.env);
            if (elicit) {
              // requestState 携带原始参数，供重试时恢复上下文
              const requestState = JSON.stringify({
                toolName,
                arguments: params?.arguments || {},
              });
              return c.json({
                jsonrpc: '2.0',
                result: {
                  resultType: 'input_required',
                  inputRequests: {
                    config_selection: elicit,
                  },
                  requestState,
                  _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO },
                },
                id,
              });
            }
          }
        }

        return respond({ content: [{ type: 'text', text: result.text }], isError: result.isError });
      }

      // ========== 资源 (Resources) ==========

      case 'resources/list': {
        validateVersion();
        if (!user) return respondError(401, 'Unauthorized');
        const resources = await listResources(user.id, c.env);
        return respond({ resources, ttlMs: 60000, cacheScope: 'private' as const });
      }

      case 'resources/templates/list': {
        validateVersion();
        return respond({ resourceTemplates: RESOURCE_TEMPLATES, ttlMs: 300000, cacheScope: 'public' as const });
      }

      case 'resources/read': {
        validateVersion();
        if (!user) return respondError(401, 'Unauthorized');
        const uri = params?.uri;
        if (!uri) return respondError(-32602, 'Missing required parameter: uri');
        const content = await readResource(uri, user.id, c.env);
        if (!content) return respondError(-32602, `Resource not found: ${uri}`);
        return respond({ contents: [{ uri, ...content }] });
      }

      // ========== 提示 (Prompts) ==========

      case 'prompts/list': {
        validateVersion();
        return respond({ prompts: PROMPTS, ttlMs: 300000, cacheScope: 'public' as const });
      }

      case 'prompts/get': {
        validateVersion();
        const promptName = params?.name;
        const promptArgs = params?.arguments || {};

        if (promptName === 'compose-email') {
          const to = promptArgs.to || '收件人';
          const subject = promptArgs.subject || '主题';
          const context = promptArgs.context || '';
          return respond({
            description: '撰写邮件',
            messages: [
              { role: 'user', content: { type: 'text', text: `请帮我撰写一封邮件。\n\n收件人: ${to}\n主题: ${subject}\n\n背景信息:\n${context}\n\n请生成邮件正文(HTML格式)，并确保语气得体。` } },
            ],
          });
        }

        if (promptName === 'reply-email') {
          const original = promptArgs.originalEmail || '';
          const context = promptArgs.replyContext || '';
          return respond({
            description: '回复邮件',
            messages: [
              { role: 'user', content: { type: 'text', text: `请帮我回复以下邮件。\n\n原始邮件:\n${original}\n\n补充说明:\n${context}\n\n请生成回复内容(HTML格式)。` } },
            ],
          });
        }

        if (promptName === 'search-email') {
          const query = promptArgs.query || '';
          return respond({
            description: '搜索邮件',
            messages: [
              { role: 'user', content: { type: 'text', text: `请搜索关于 "${query}" 的邮件，并总结搜索结果。` } },
            ],
          });
        }

        return respondError(-32602, `Unknown prompt: ${promptName}`);
      }

      // ========== 补全 (Completions) ==========

      case 'completion/complete': {
        validateVersion();
        if (!user) return respondError(401, 'Unauthorized');
        const result = await completeArgument(params?.ref, params?.argument, user.id, c.env);
        return respond({ completion: result });
      }

      // ========== 订阅 (Subscriptions) ==========

      case 'subscriptions/listen': {
        validateVersion();
        const notifications = params?.notifications || {};
        // 在 POST 上下文中，subscriptions/listen 确认订阅请求。
        // 实际通知流通过 GET SSE 端点传递。
        // 订阅过滤器会记录在 sseClients 中（由客户端通过 endpoint 事件关联）。
        const ackFilter: any = {};
        if (notifications.toolsListChanged) ackFilter.toolsListChanged = true;
        if (notifications.promptsListChanged) ackFilter.promptsListChanged = true;
        if (notifications.resourcesListChanged) ackFilter.resourcesListChanged = true;
        // 更新该用户的所有活跃 SSE 连接的过滤器
        // 在简化实现中，所有连接都接收订阅的通知
        return respond({});
      }

      // ========== 自定义扩展 ==========

      case 'auth/current-user':
        return user ? respond({ user }) : respondError(401, 'Unauthorized');

      default:
        return respondError(-32601, `Method not found: ${method}`);
    }
  } catch (err: any) {
    if (err.code && err.message) {
      return respondError(err.code, err.message);
    }
    return respondError(-32603, (err as Error).message || 'Internal error');
  }
});

export default mcp;