import { Hono } from 'hono';
import type { Env } from '../../types';
import { EmailService } from '../services/emailService';
import { InboxService } from '../services/inboxService';
import { TemplateService } from '../services/templateService';
import { SmtpService } from '../services/smtpService';

/**
 * MCP (Model Context Protocol) Server - 让 AI 模型能调用邮件服务
 * 通过 HTTP + JSON-RPC 实现，暴露 tools/list 和 tools/call
 */

// 从 API Key 获取用户（简化：通过 API key 查询用户）
async function getUserByApiKey(env: Env, apiKey: string): Promise<{ id: string } | null> {
  if (!apiKey) return null;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(apiKey));
  const hashHex = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  const row = await env.DB.prepare('SELECT id FROM users WHERE api_key_hash = ?').bind(hashHex).first<any>();
  return row ? { id: row.id } : null;
}

// 工具定义
const TOOLS = [
  {
    name: 'send_email',
    description: '发送邮件。需要 to(收件人)、subject(主题)、html 或 text(内容)。可选 configId(发件配置)。',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: '收件人邮箱，多个用逗号分隔' },
        subject: { type: 'string', description: '邮件主题' },
        html: { type: 'string', description: 'HTML 内容' },
        text: { type: 'string', description: '纯文本内容' },
        configId: { type: 'string', description: '发件配置 ID（可选，不填则需指定）' },
        cc: { type: 'string', description: '抄送，多个用逗号分隔' }
      },
      required: ['to', 'subject']
    }
  },
  {
    name: 'list_inbox',
    description: '查看收件箱邮件列表。需要 configId(发件配置 ID，需配置了 IMAP)。可选 folder 和 page。',
    inputSchema: {
      type: 'object',
      properties: {
        configId: { type: 'string', description: '发件配置 ID' },
        folder: { type: 'string', description: '文件夹，默认 INBOX' },
        page: { type: 'number', description: '页码，默认 1' }
      },
      required: ['configId']
    }
  },
  {
    name: 'search_emails',
    description: '搜索收件箱邮件。需要 configId 和 q(搜索关键词)。',
    inputSchema: {
      type: 'object',
      properties: {
        configId: { type: 'string', description: '发件配置 ID' },
        q: { type: 'string', description: '搜索关键词（主题/发件人/收件人）' }
      },
      required: ['configId', 'q']
    }
  },
  {
    name: 'get_email',
    description: '获取邮件详情。需要 emailId。',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'string', description: '邮件 ID' }
      },
      required: ['emailId']
    }
  },
  {
    name: 'list_smtp_configs',
    description: '获取发件配置列表。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'list_templates',
    description: '获取邮件模板列表。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'list_inbox_configs',
    description: '获取支持 IMAP 收件的发件配置。',
    inputSchema: { type: 'object', properties: {} }
  }
];

const mcp = new Hono<{ Bindings: Env }>();

// 处理 MCP JSON-RPC 请求
mcp.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return c.json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null });
  }

  const { method, id, params } = body as any;

  // 认证：从 headers 读取 API Key
  const authHeader = c.req.header('Authorization') || '';
  const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const user = await getUserByApiKey(c.env, apiKey);

  const respond = (result: any) => c.json({ jsonrpc: '2.0', result, id });
  const respondError = (code: number, message: string) => c.json({ jsonrpc: '2.0', error: { code, message }, id });

  switch (method) {
    case 'initialize':
      return respond({
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'cf-worker-mailer-mcp', version: '1.0.0' }
      });

    case 'notifications/initialized':
      return c.json({ jsonrpc: '2.0', result: null, id });

    case 'tools/list':
      return respond({ tools: TOOLS });

    case 'auth/current-user':
      return user ? respond({ user }) : respondError(401, 'Unauthorized');

    case 'tools/call': {
      if (!user) return respondError(401, 'Unauthorized: 请提供有效的 API Key');
      const toolName = params?.name;
      const args = params?.arguments || {};

      try {
        switch (toolName) {
          case 'send_email': {
            const emailService = new EmailService(c.env, user.id);
            const toArr = String(args.to || '').split(',').map(s => s.trim()).filter(Boolean);
            if (!toArr.length) return respondError(400, '收件人不能为空');
            const result = await emailService.sendEmail({
              to: toArr,
              subject: String(args.subject || ''),
              html: args.html ? String(args.html) : undefined,
              text: args.text ? String(args.text) : undefined,
              configId: args.configId ? String(args.configId) : undefined,
              cc: args.cc ? String(args.cc).split(',').map((s: string) => s.trim()).filter(Boolean) : undefined
            });
            return respond({ success: true, id: result.id, status: result.status, message: '邮件已发送' });
          }

          case 'list_inbox': {
            const inboxService = new InboxService(c.env, user.id);
            const configId = String(args.configId || '');
            const folder = String(args.folder || 'INBOX');
            const page = Number(args.page || 1);
            const result = await inboxService.listEmails(configId, folder, page, 20);
            return respond(result);
          }

          case 'search_emails': {
            const inboxService = new InboxService(c.env, user.id);
            const configId = String(args.configId || '');
            const q = String(args.q || '');
            const result = await inboxService.searchEmails(configId, q);
            return respond(result);
          }

          case 'get_email': {
            const inboxService = new InboxService(c.env, user.id);
            const email = await inboxService.getEmail(String(args.emailId || ''));
            if (!email) return respondError(404, '邮件不存在');
            return respond({ email });
          }

          case 'list_smtp_configs': {
            const smtpService = new SmtpService(c.env, user.id);
            const configs = await smtpService.findAll();
            return respond({ configs });
          }

          case 'list_templates': {
            const templateService = new TemplateService(c.env, user.id);
            const templates = await templateService.list();
            return respond({ templates });
          }

          case 'list_inbox_configs': {
            const inboxService = new InboxService(c.env, user.id);
            const configs = await inboxService.getImapEnabledConfigs();
            return respond({ configs });
          }

          default:
            return respondError(-32601, `Unknown tool: ${toolName}`);
        }
      } catch (error) {
        console.error('MCP tool error:', error);
        return respondError(-32603, (error as Error).message || 'Internal error');
      }
    }

    default:
      return respondError(-32601, `Method not found: ${method}`);
  }
});

export default mcp;