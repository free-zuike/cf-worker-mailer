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

// 异步同步某个 SMTP 配置的收件箱（推送到队列，不等待）
inbox.post('/sync/:configId', async (c) => {
  const user = c.get('user');
  const configId = c.req.param('configId');
  // 推送到队列后台处理
  await c.env.MAIL_QUEUE.send({
    type: 'inbox-sync',
    configId,
    userId: user.id
  });
  return c.json({ message: '同步任务已提交，请稍后刷新查看' });
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