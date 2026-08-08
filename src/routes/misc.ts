import { Hono } from 'hono';
import type { Env, User } from '../../types';
import { authMiddleware } from '../middleware/auth';
import { EmailService } from '../services/emailService';
import { UserService } from '../services/userService';

const misc = new Hono<{ Bindings: Env; Variables: { user: User } }>();

misc.use('*', authMiddleware);

// 统计
misc.get('/metrics', async (c) => {
  const user = c.get('user');
  const emailService = new EmailService(c.env, user.id);
  const metrics = await emailService.getMetrics();
  return c.json({ metrics });
});

// API Key
misc.post('/api-key/generate', async (c) => {
  const user = c.get('user');
  const userService = new UserService(c.env);
  const apiKey = await userService.generateApiKey(user.id);
  return c.json({ apiKey });
});

export default misc;