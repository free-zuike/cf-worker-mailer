import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from '../types';
import api from './routes/api';
import { EmailService } from './services/emailService';
import { initDatabase } from './db/init';

/** 邮件发送队列消息体 */
interface QueueEmailMessage {
  emailId: string;
  userId: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS 配置
app.use('*', cors({
  origin: (origin, c) => {
    // 使用环境变量限制允许的来源
    const env = c.env as Env;
    const allowedOrigins = env?.ALLOWED_ORIGINS?.split(',').map((o: string) => o.trim()) || [];
    if (allowedOrigins.length === 0) {
      // 如果未配置，则仅允许同源请求
      return origin || null;
    }
    if (origin && allowedOrigins.includes(origin)) {
      return origin;
    }
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
}));

// 健康检查（初始化数据库）
app.get('/health', async (c) => {
  try {
    await initDatabase(c.env);
    return c.json({ status: 'ok', database: 'initialized', timestamp: new Date().toISOString() });
  } catch (error) {
    return c.json({ status: 'error', error: (error as Error).message, timestamp: new Date().toISOString() }, 500);
  }
});

// API 路由
app.route('/api', api);

// 提供 R2 上传的文件
app.get('/api/uploads/*', async (c) => {
  const key = c.req.path.replace('/api/', '');
  const object = await c.env.R2_UPLOAD_BUCKET.get(key);
  if (!object) return c.json({ error: 'File not found' }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000');
  return new Response(object.body, { headers });
});

// 静态资源（前端）- 访问首页时自动初始化数据库
app.get('*', async (c) => {
  try {
    // 访问首页时自动初始化数据库
    const url = new URL(c.req.url);
    if (url.pathname === '/' || url.pathname === '/index.html') {
      await initDatabase(c.env);
    }
  } catch (error) {
    console.error('Database initialization failed:', error);
    // 即使数据库初始化失败，也继续返回页面
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  async queue(batch: MessageBatch<QueueEmailMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Processing ${batch.messages.length} messages from queue`);

    for (const message of batch.messages) {
      try {
        const { emailId, userId } = message.body;
        const emailService = new EmailService(env, userId);
        await emailService.processEmail(emailId);
        message.ack();
      } catch (error) {
        console.error('Failed to process queue message:', error);
        message.retry();
      }
    }
  }
};
