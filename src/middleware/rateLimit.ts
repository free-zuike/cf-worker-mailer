import type { Context, Next } from 'hono';
import type { Env, User } from '../../types';

/** 简单的内存速率限制器（每个 Worker 实例独立） */
const requestCounts = new Map<string, { count: number; resetAt: number }>();

// 每 5 分钟清理过期记录
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of requestCounts) {
    if (val.resetAt < now) requestCounts.delete(key);
  }
}, 300_000);

/**
 * 速率限制中间件
 * @param limit 限制次数
 * @param windowMs 时间窗口（毫秒）
 */
export function rateLimit(limit = 60, windowMs = 60_000) {
  return async function rateLimitMiddleware(c: Context<{ Bindings: Env; Variables: { user: User } }>, next: Next) {
    const userId = c.get('user')?.id || 'anonymous';
    const now = Date.now();
    const key = `${userId}:${Math.floor(now / windowMs)}`;

    const record = requestCounts.get(key);
    if (!record || record.resetAt < now) {
      requestCounts.set(key, { count: 1, resetAt: now + windowMs });
      await next();
      return;
    }

    if (record.count >= limit) {
      return c.json({ error: 'Too many requests. Please try again later.' }, 429);
    }

    record.count++;
    await next();
  };
}