import { Hono } from 'hono';
import type { Env, User } from '../../types';
import { UserService } from '../services/userService';

export async function authMiddleware(c: any, next: any) {
  const authHeader = c.req.header('Authorization');
  const apiKeyHeader = c.req.header('X-API-Key');

  let user: User | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const userService = new UserService(c.env);
    user = await userService.findByToken(token);
  } else if (apiKeyHeader) {
    // API Key 验证 - 通过哈希匹配
    const userService = new UserService(c.env);
    user = await userService.findByApiKey(apiKeyHeader);
  }

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', user);
  await next();
}

// 仅管理员可以通过
export async function adminMiddleware(c: any, next: any) {
  const user = c.get('user') as User | undefined;
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (user.role !== 'admin') {
    return c.json({ error: 'Forbidden: administrators only' }, 403);
  }
  await next();
}
