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
    // TODO: 实现 API Key 认证
    user = null; // 暂时为 null
  }

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', user);
  await next();
}

export async function optionalAuthMiddleware(c: any, next: any) {
  const authHeader = c.req.header('Authorization');
  const apiKeyHeader = c.req.header('X-API-Key');

  let user: User | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const userService = new UserService(c.env);
    user = await userService.findByToken(token);
  } else if (apiKeyHeader) {
    // TODO: 实现 API Key 认证
    user = null;
  }

  if (user) {
    c.set('user', user);
  }

  await next();
}
