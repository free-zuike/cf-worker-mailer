import { Hono } from 'hono';
import type { Env, User } from '../../types';
import { authMiddleware } from '../middleware/auth';
import { EmailService } from '../services/emailService';
import { UserService } from '../services/userService';
import { GlobalVariableService } from '../services/globalVariableService';

const misc = new Hono<{ Bindings: Env; Variables: { user: User } }>();

// 调试接口（无需登录）
misc.get('/debug/variables', async (c) => {
  const svc = new GlobalVariableService(c.env);
  const list = await svc.list();
  const map = await svc.getKeyValueMap();
  return c.json({ list, map });
});

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