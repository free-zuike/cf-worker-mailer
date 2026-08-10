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

// API Key 管理
misc.post('/api-key/generate', async (c) => {
  const user = c.get('user');
  const { name, expiresInDays } = await c.req.json().catch(() => ({}));
  const userService = new UserService(c.env);
  const result = await userService.generateApiKey(user.id, String(name || 'default'), expiresInDays ? Number(expiresInDays) : undefined);
  return c.json(result, 201);
});

// 列出 API Key
misc.get('/api-keys', async (c) => {
  const user = c.get('user');
  const userService = new UserService(c.env);
  const keys = await userService.listApiKeys(user.id);
  return c.json({ keys });
});

// 删除 API Key
misc.delete('/api-key/:id', async (c) => {
  const user = c.get('user');
  const userService = new UserService(c.env);
  await userService.deleteApiKey(user.id, c.req.param('id'));
  return c.json({ success: true });
});

export default misc;