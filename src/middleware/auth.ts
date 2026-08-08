import type { Context, Next } from 'hono';
import type { Env, User } from '../../types';
import { UserService } from '../services/userService';

export async function authMiddleware(c: Context<{ Bindings: Env; Variables: { user: User } }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  const apiKeyHeader = c.req.header('X-API-Key');

  let user: User | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const userService = new UserService(c.env);
    user = await userService.findByToken(token);
  } else if (apiKeyHeader) {
    const userService = new UserService(c.env);
    user = await userService.findByApiKey(apiKeyHeader);
  }

  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('user', user);
  await next();
}

export async function adminMiddleware(c: Context<{ Bindings: Env; Variables: { user: User } }>, next: Next) {
  const user = c.get('user') as User | undefined;
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  if (user.role !== 'admin') {
    return c.json({ error: 'Forbidden: administrators only' }, 403);
  }
  await next();
}
