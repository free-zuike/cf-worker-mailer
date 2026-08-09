import { Hono } from 'hono';
import type { Env, User } from '../../types';
import { authMiddleware } from '../middleware/auth';
import { EmailService } from '../services/emailService';
import { rateLimit } from '../middleware/rateLimit';

const emails = new Hono<{ Bindings: Env; Variables: { user: User } }>();

emails.use('*', authMiddleware);

emails.post('/', rateLimit(20, 60_000), async (c) => {
  const user = c.get('user');
  const data = await c.req.json();
  const emailService = new EmailService(c.env, user.id);
  try {
    const result = await emailService.sendEmail(data);
    return c.json(result, 202);
  } catch (error) {
    console.error('Send email error:', error);
    return c.json({ error: (error as Error).message || 'Failed to send email' }, 500);
  }
});

emails.get('/', async (c) => {
  const user = c.get('user');
  const limitParam = parseInt(c.req.query('limit') || '50');
  const offsetParam = parseInt(c.req.query('offset') || '0');
  const limit = isNaN(limitParam) || limitParam < 1 ? 50 : Math.min(limitParam, 100);
  const offset = isNaN(offsetParam) || offsetParam < 0 ? 0 : offsetParam;
  const emailService = new EmailService(c.env, user.id);
  const history = await emailService.listHistory(limit, offset);
  return c.json({ history });
});

emails.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const emailService = new EmailService(c.env, user.id);
  const email = await emailService.getHistory(id);
  if (!email) {
    return c.json({ error: 'Email not found' }, 404);
  }
  return c.json({ email });
});

// 重试发送失败的邮件
emails.post('/:id/retry', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const emailService = new EmailService(c.env, user.id);
  try {
    await emailService.retryFailedEmail(id);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: (error as Error).message || 'Retry failed' }, 400);
  }
});

export default emails;