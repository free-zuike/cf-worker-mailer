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

// 获取文件夹列表
inbox.get('/folders/:configId', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  try {
    const folders = await svc.getFolders(c.req.param('configId'));
    return c.json({ folders });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

// 列出邮件（支持文件夹筛选）
inbox.get('/emails/:configId', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');
  const folder = c.req.query('folder') || 'INBOX';
  const result = await svc.listEmails(c.req.param('configId'), folder, page, pageSize);
  return c.json(result);
});

// 获取邮件详情（不改变已读状态）
inbox.get('/email/:id', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  const email = await svc.getEmail(c.req.param('id'));
  if (!email) return c.json({ error: '邮件不存在' }, 404);
  return c.json({ email });
});

// 获取邮件完整内容（正文，按需从 IMAP 拉取，并标记已读）
inbox.get('/email/:id/full', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  const email = await svc.fetchEmailContent(c.req.param('id'));
  if (!email) return c.json({ error: '邮件不存在' }, 404);
  return c.json({ email });
});

// 标记已读
inbox.post('/email/:id/read', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  await svc.markAsRead(c.req.param('id'));
  return c.json({ success: true });
});

// 标记未读
inbox.post('/email/:id/unread', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  await svc.markAsUnread(c.req.param('id'));
  return c.json({ success: true });
});

// 星标/取消星标
inbox.post('/email/:id/star', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  const starred = await svc.toggleStar(c.req.param('id'));
  return c.json({ starred });
});

// 移动邮件到其他文件夹
inbox.post('/email/:id/move', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  const { targetFolder } = await c.req.json();
  if (!targetFolder) return c.json({ error: '目标文件夹不能为空' }, 400);
  await svc.moveEmail(c.req.param('id'), targetFolder);
  return c.json({ success: true });
});

// 搜索邮件（支持文件夹筛选）
inbox.get('/search/:configId', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  const query = c.req.query('q') || '';
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = parseInt(c.req.query('pageSize') || '20');
  const result = await svc.searchEmails(c.req.param('configId'), query, page, pageSize);
  return c.json(result);
});

// 下载附件
inbox.get('/attachment/:emailId/:index', async (c) => {
  const svc = new InboxService(c.env, c.get('user').id);
  const email = await svc.getEmail(c.req.param('emailId'));
  if (!email) return c.json({ error: '邮件不存在' }, 404);
  let attachments: any[] = [];
  try { attachments = JSON.parse(email.attachments || '[]'); } catch {}
  const index = parseInt(c.req.param('index'));
  const att = attachments[index];
  if (!att || !att.contentBase64) return c.json({ error: '附件不存在' }, 404);
  const bytes = Uint8Array.from(atob(att.contentBase64), c => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'Content-Type': att.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(att.filename || 'attachment')}"`
    }
  });
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