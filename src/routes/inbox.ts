import { Hono } from 'hono';
import type { Env, User } from '../../types';
import { authMiddleware } from '../middleware/auth';
import { InboxService } from '../services/inboxService';

const inbox = new Hono<{ Bindings: Env; Variables: { user: User } }>();

inbox.use('*', authMiddleware);

// 获取支持 IMAP 的 SMTP 配置列表
inbox.get('/configs', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  const configs = await svc.getImapEnabledConfigs();
  return c.json({ configs });
});

// 同步某个 SMTP 配置的收件箱
inbox.post('/sync/:configId', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  try {
    const result = await svc.syncByConfigId(c.req.param('configId'));
    return c.json(result);
  } catch (error) {
    console.error('Sync inbox error:', error);
    return c.json({ error: (error as Error).message || '同步失败，请检查 IMAP 配置和授权码' }, 500);
  }
});

// 列出邮件
inbox.get('/emails/:configId', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');
  const result = await svc.listEmails(c.req.param('configId'), page, pageSize);
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

// 未读数
inbox.get('/unread/:configId', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  const count = await svc.getUnreadCount(c.req.param('configId'));
  return c.json({ count });
});

export default inbox;