import { Hono } from 'hono';
import type { Env, User } from '../../types';
import { authMiddleware } from '../middleware/auth';
import { InboxService } from '../services/inboxService';

const inbox = new Hono<{ Bindings: Env; Variables: { user: User } }>();

inbox.use('*', authMiddleware);

// ============ 账户管理 ============

// 列出所有 IMAP 账户
inbox.get('/accounts', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  const accounts = await svc.listAccounts();
  return c.json({ accounts });
});

// 创建 IMAP 账户
inbox.post('/accounts', async (c) => {
  const data = await c.req.json();
  if (!data.name || !data.host || !data.port || !data.username || !data.password) {
    return c.json({ error: '名称、服务器、端口、用户名、密码为必填项' }, 400);
  }
  const svc = new InboxService(c.env, c.get('user').id);
  const account = await svc.createAccount(data);
  return c.json({ account }, 201);
});

// 更新 IMAP 账户
inbox.put('/accounts/:id', async (c) => {
  const data = await c.req.json();
  const svc = new InboxService(c.env, c.get('user').id);
  const account = await svc.updateAccount(c.req.param('id'), data);
  return c.json({ account });
});

// 删除 IMAP 账户
inbox.delete('/accounts/:id', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  await svc.deleteAccount(c.req.param('id'));
  return c.json({ success: true });
});

// 同步 IMAP 账户
inbox.post('/accounts/:id/sync', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  const result = await svc.syncAccount(c.req.param('id'));
  return c.json(result);
});

// ============ 邮件管理 ============

// 列出邮件
inbox.get('/emails/:accountId', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');
  const result = await svc.listEmails(c.req.param('accountId'), page, pageSize);
  return c.json(result);
});

// 获取邮件详情
inbox.get('/email/:id', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  const email = await svc.getEmail(c.req.param('id'));
  if (!email) return c.json({ error: '邮件不存在' }, 404);
  return c.json({ email });
});

// 删除邮件
inbox.delete('/email/:id', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  await svc.deleteEmail(c.req.param('id'));
  return c.json({ success: true });
});

// 标记为已读
inbox.post('/email/:id/read', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  await svc.markAsRead(c.req.param('id'));
  return c.json({ success: true });
});

// 未读数
inbox.get('/unread/:accountId', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  const count = await svc.getUnreadCount(c.req.param('accountId'));
  return c.json({ count });
});

export default inbox;