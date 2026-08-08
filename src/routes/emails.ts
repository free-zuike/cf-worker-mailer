import { Hono } from 'hono';
import type { Env, User } from '../../types';
import { authMiddleware } from '../middleware/auth';
import { EmailService } from '../services/emailService';

const emails = new Hono<{ Bindings: Env; Variables: { user: User } }>();

emails.use('*', authMiddleware);

emails.post('/', async (c) => {
  const user = c.get('user');
  const data = await c.req.json();
  const emailService = new EmailService(c.env, user.id);
  const result = await emailService.sendEmail(data);
  return c.json(result, 202);
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

export default emails;