import { Hono } from 'hono';
import type { Env } from '../../types';
import { EmailService } from '../services/emailService';
import { InboxService } from '../services/inboxService';
import { TemplateService } from '../services/templateService';
import { SmtpService } from '../services/smtpService';
import { UserService } from '../services/userService';

/**
 * MCP (Model Context Protocol) Server
 * 支持协议:
 *   - 2025-11-25 (SDK ≤1.30 客户端, 带 initialize 握手)
 *   - 2026-07-28 (stateless, per-request _meta)
 */

const SUPPORTED_PROTOCOL_VERSIONS = ['2026-07-28', '2025-11-25'];
const DEFAULT_PROTOCOL_VERSION = '2025-11-25';

const SERVER_INFO = {
  name: 'cf-worker-mailer-mcp',
  version: '1.0.0',
};

// 从 API Key 获取用户（检查有效期）
async function getUserByApiKey(env: Env, apiKey: string): Promise<{ id: string } | null> {
  if (!apiKey) return null;
  const userService = new UserService(env);
  return userService.getUserByApiKey(apiKey);
}

// 工具定义
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
      properties: {
        emailId: { type: 'string', description: '邮件 ID' },
      },
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
];

const mcp = new Hono<{ Bindings: Env }>();

// SDK 1.30 (Streamable HTTP) 客户端会尝试 GET 建立 SSE 流，
// 返回 405 让客户端优雅降级（仅使用 POST 通信）
mcp.get('/', (c) => c.text('Method Not Allowed', 405));

// 处理 MCP JSON-RPC 请求
mcp.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null });
  }

  const { method, id, params } = body as any;
  const meta = params?._meta || {};

  // 认证：从 headers 读取 API Key
  const authHeader = c.req.header('Authorization') || '';
  const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const user = await getUserByApiKey(c.env, apiKey);

  // 成功响应（自动注入 resultType 和 serverInfo）
  const respond = (result: object) => c.json({
    jsonrpc: '2.0',
    result: { resultType: 'complete', ...result, _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO } },
    id,
  });

  // JSON-RPC 协议错误
  const respondError = (code: number, message: string) => c.json({ jsonrpc: '2.0', error: { code, message }, id });

  // 工具执行错误（含 isError 标记，供 LLM 自我纠正）
  const respondToolError = (message: string) => respond({
    content: [{ type: 'text', text: message }],
    isError: true,
  });

  switch (method) {
    /**
     * 旧协议握手（SDK ≤1.30 客户端）
     * 客户端发送 initialize 后，服务器协商协议版本。
     * 服务器返回的版本必须在客户端 SUPPORTED_PROTOCOL_VERSIONS 中，
     * 否则客户端会抛错。
     */
    case 'initialize': {
      const requestedVersion = params?.protocolVersion;
      const negotiated = SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)
        ? requestedVersion
        : DEFAULT_PROTOCOL_VERSION;
      return respond({
        protocolVersion: negotiated,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: '邮件发送服务。支持发送邮件、管理收件箱、搜索邮件、管理模板和发件配置。',
      });
    }

    // 旧协议通知（客户端初始化完成，无响应体）
    case 'notifications/initialized':
      return c.json({ jsonrpc: '2.0', result: null, id });

    /**
     * 新协议发现端点（2026-07-28）
     * 客户端通过 server/discover 获取服务器支持的协议版本和能力。
     */
    case 'server/discover':
      return respond({
        supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
        capabilities: { tools: {} },
        instructions: '邮件发送服务。支持发送邮件、管理收件箱、搜索邮件、管理模板和发件配置。',
        ttlMs: 300000,
        cacheScope: 'public' as const,
      });

    case 'tools/list':
      return respond({ tools: TOOLS, ttlMs: 300000, cacheScope: 'public' as const });

    case 'auth/current-user':
      return user ? respond({ user }) : respondError(401, 'Unauthorized');

    case 'tools/call': {
      // 2026-07-28 新协议校验：请求带 _meta 时验证协议版本
      const declaredVersion = meta['io.modelcontextprotocol/protocolVersion'];
      if (declaredVersion !== undefined) {
        if (typeof declaredVersion !== 'string') {
          return respondError(-32602, 'Invalid _meta.io.modelcontextprotocol/protocolVersion');
        }
        const headerVersion = c.req.header('MCP-Protocol-Version');
        if (headerVersion && headerVersion !== declaredVersion) {
          return respondError(-32020, 'MCP-Protocol-Version header does not match request body');
        }
        if (!SUPPORTED_PROTOCOL_VERSIONS.includes(declaredVersion)) {
          return respondError(-32022, `Unsupported protocol version: ${declaredVersion}`);
        }
      }
      // 无 _meta 的请求（旧协议客户端）→ 直接放行

      if (!user) return respondError(401, 'Unauthorized: 请提供有效的 API Key');
      const toolName = params?.name;
      const args = params?.arguments || {};

      try {
        switch (toolName) {
          case 'send_email': {
            const toArr = String(args.to || '').split(',').map(s => s.trim()).filter(Boolean);
            if (!toArr.length) return respondToolError('收件人不能为空');
            if (!args.configId) return respondToolError('缺少 configId，请先调用 list_smtp_configs 获取发件配置 ID');
            const emailService = new EmailService(c.env, user.id);
            const result = await emailService.sendEmail({
              to: toArr,
              subject: String(args.subject || ''),
              html: args.html ? String(args.html) : undefined,
              text: args.text ? String(args.text) : undefined,
              configId: String(args.configId),
              cc: args.cc ? String(args.cc).split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
            });
            return respond({
              content: [{ type: 'text', text: `邮件已发送，ID: ${result.id}，状态: ${result.status}` }],
              isError: false,
            });
          }

          case 'list_inbox': {
            if (!args.configId) return respondToolError('缺少 configId，请先调用 list_inbox_configs 获取配置 ID');
            const svc = new InboxService(c.env, user.id);
            const result = await svc.listEmails(String(args.configId), String(args.folder || 'INBOX'), Number(args.page || 1), 20);
            return respond({ content: [{ type: 'text', text: JSON.stringify(result) }], isError: false });
          }

          case 'search_emails': {
            if (!args.configId) return respondToolError('缺少 configId');
            if (!args.q) return respondToolError('缺少搜索关键词 q');
            const svc = new InboxService(c.env, user.id);
            const result = await svc.searchEmails(String(args.configId), String(args.q));
            return respond({ content: [{ type: 'text', text: JSON.stringify(result) }], isError: false });
          }

          case 'get_email': {
            const inboxService = new InboxService(c.env, user.id);
            const email = await inboxService.getEmail(String(args.emailId || ''));
            if (!email) return respondToolError('邮件不存在');
            return respond({ content: [{ type: 'text', text: JSON.stringify({ email }) }], isError: false });
          }

          case 'list_smtp_configs': {
            const smtpService = new SmtpService(c.env, user.id);
            const configs = await smtpService.findAll();
            return respond({ content: [{ type: 'text', text: JSON.stringify({ configs }) }], isError: false });
          }

          case 'list_templates': {
            const templateService = new TemplateService(c.env, user.id);
            const templates = await templateService.list();
            return respond({ content: [{ type: 'text', text: JSON.stringify({ templates }) }], isError: false });
          }

          case 'list_inbox_configs': {
            const inboxService = new InboxService(c.env, user.id);
            const configs = await inboxService.getImapEnabledConfigs();
            return respond({ content: [{ type: 'text', text: JSON.stringify({ configs }) }], isError: false });
          }

          default:
            return respondError(-32602, `Unknown tool: ${toolName}`);
        }
      } catch (error) {
        console.error('MCP tool error:', error);
        return respond({ content: [{ type: 'text', text: (error as Error).message || 'Internal error' }], isError: true });
      }
    }

    default:
      return respondError(-32601, `Method not found: ${method}`);
  }
});

export default mcp;