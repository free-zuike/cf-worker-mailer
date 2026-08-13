import { describe, it, expect, vi } from 'vitest';

// emailService 顶层 import 了 worker-mailer（依赖 cloudflare:sockets，
// Node 环境不存在）。测试不涉及真实邮件发送，打桩 EmailService 即可
vi.mock('../services/emailService', () => ({
  EmailService: class {
    async sendEmail() { return { id: 'test-id', status: 'sent', createdAt: new Date().toISOString() }; }
    async getHistory() { return null; }
    async listHistory() { return []; }
    async retryFailedEmail() {}
    async getMetrics() { return { total: 0, sent: 0, failed: 0, pending: 0 }; }
  },
}));

import mcp from './mcp';
import type { Env } from '../../types';

// 最小可用 Env。DB 打桩使其能通过 API Key 认证（hash 后 key 固定）
const dbStub = {
  prepare: () => ({
    bind: () => ({
      first: async () => ({ id: 'user-1', expires_at: null }),
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }),
  }),
};

const env = {
  DB: dbStub as any,
  MAIL_QUEUE: {} as any,
  ASSETS: { fetch: async () => new Response('') } as any,
  R2_UPLOAD_BUCKET: {} as any,
} as Env;

const POST = (body: unknown, headers: Record<string, string> = {}) =>
  mcp.request('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }, env);

const postJson = async (body: unknown, headers: Record<string, string> = {}) => {
  const res = await POST(body, headers);
  return { status: res.status, json: await res.json() as any };
};

describe('MCP 基础协议', () => {
  it('GET 非 SSE 请求返回 405', async () => {
    const res = await mcp.request('/', { method: 'GET' }, env);
    expect(res.status).toBe(405);
  });

  it('invalid JSON 返回 -32700 Parse error', async () => {
    const res = await POST('not-json');
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(body)).toMatchObject({ jsonrpc: '2.0', error: { code: -32700 } });
  });

  it('initialize 协商 2025-11-25', async () => {
    const { status, json } = await postJson({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1.0.0' } },
    });
    expect(status).toBe(200);
    expect(json.result.resultType).toBe('complete');
    expect(json.result.protocolVersion).toBe('2025-11-25');
    expect(json.result.capabilities).toHaveProperty('tools');
  });

  it('notifications/initialized 返回 202 无响应体', async () => {
    const res = await POST({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });

  it('server/discover 返回支持版本列表', async () => {
    const { json } = await postJson({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: {} });
    expect(json.result.supportedVersions).toContain('2026-07-28');
    expect(json.result.supportedVersions).toContain('2025-11-25');
  });

  it('ping 返回空结果', async () => {
    const { status, json } = await postJson({ jsonrpc: '2.0', id: 1, method: 'ping', params: {} });
    expect(status).toBe(200);
    expect(json.result.resultType).toBe('complete');
  });

  it('notifications/cancelled 返回 202', async () => {
    const res = await POST({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } });
    expect(res.status).toBe(202);
  });
});

describe('MCP 版本验证', () => {
  const tools = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } };
  const MODERN_HDR = { 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/list' };

  it('新协议正确版本放行', async () => {
    const { status } = await postJson(tools, MODERN_HDR);
    expect(status).toBe(200);
  });

  it('不支持的版本返回 -32022 + HTTP 400', async () => {
    const { status, json } = await postJson({
      jsonrpc: '2.0', id: 1, method: 'tools/list',
      params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2024-01-01' } },
    });
    expect(status).toBe(400);
    expect(json.error.code).toBe(-32022);
    expect(json.error.data.supported).toContain('2026-07-28');
  });

  it('header 与 body 版本不一致返回 -32020 + HTTP 400', async () => {
    const { status, json } = await postJson(tools, { 'MCP-Protocol-Version': '2025-11-25' });
    expect(status).toBe(400);
    expect(json.error.code).toBe(-32020);
  });

  it('旧协议无 _meta 放行', async () => {
    const { status } = await postJson({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(status).toBe(200);
  });
});

describe('MCP 工具', () => {
  it('tools/list 返回 7+ 工具', async () => {
    const { json } = await postJson({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(json.result.tools.length).toBeGreaterThanOrEqual(7);
  });

  it('tools/call 未认证返回 401', async () => {
    const { status, json } = await postJson({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'list_smtp_configs', arguments: {} },
    });
    expect(status).toBe(200);
    expect(json.error.code).toBe(401);
  });

  it('tools/call 未知工具返回 -32602', async () => {
    const { status, json } = await postJson({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'no_such_tool', arguments: {} },
    }, { Authorization: 'Bearer test-key' });
    expect(status).toBe(200);
    expect(json.error.code).toBe(-32602);
  });
});

describe('MCP 资源', () => {
  it('resources/templates/list 返回 4 个模板', async () => {
    const { json } = await postJson({ jsonrpc: '2.0', id: 1, method: 'resources/templates/list' });
    expect(json.result.resourceTemplates.length).toBe(4);
  });

  it('resources/list 未认证返回 401', async () => {
    const { json } = await postJson({ jsonrpc: '2.0', id: 1, method: 'resources/list' });
    expect(json.error.code).toBe(401);
  });

  it('resources/read 缺 uri 返回 -32602', async () => {
    const { json } = await postJson({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: {} },
      { Authorization: 'Bearer test-key' });
    expect(json.error.code).toBe(-32602);
  });
});

describe('MCP 提示与补全', () => {
  it('prompts/list 返回 3 个模板', async () => {
    const { json } = await postJson({ jsonrpc: '2.0', id: 1, method: 'prompts/list' });
    expect(json.result.prompts.length).toBe(3);
  });

  it('prompts/get compose-email 返回 messages', async () => {
    const { json } = await postJson({
      jsonrpc: '2.0', id: 1, method: 'prompts/get',
      params: { name: 'compose-email', arguments: { to: 'a@b.com', subject: 'hi', context: 'x' } },
    });
    expect(json.result.messages[0].role).toBe('user');
    expect(json.result.messages[0].content.text).toContain('a@b.com');
  });

  it('prompts/get 未知 prompt 返回 -32602', async () => {
    const { json } = await postJson({
      jsonrpc: '2.0', id: 1, method: 'prompts/get', params: { name: 'unknown' },
    });
    expect(json.error.code).toBe(-32602);
  });

  it('completion/complete 缺 argument 返回 -32602', async () => {
    const { json } = await postJson({ jsonrpc: '2.0', id: 1, method: 'completion/complete', params: {} },
      { Authorization: 'Bearer test-key' });
    expect(json.error.code).toBe(-32602);
  });
});

describe('MCP 订阅与未知方法', () => {
  it('subscriptions/listen 未认证返回 401', async () => {
    const { json } = await postJson({
      jsonrpc: '2.0', id: 1, method: 'subscriptions/listen',
      params: { notifications: { resourcesListChanged: true } },
    });
    expect(json.error.code).toBe(401);
  });

  it('未知方法返回 -32601', async () => {
    const { json } = await postJson({ jsonrpc: '2.0', id: 1, method: 'no/such/method' });
    expect(json.error.code).toBe(-32601);
  });
});