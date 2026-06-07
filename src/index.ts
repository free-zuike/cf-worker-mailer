import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from '../types';
import api from './routes/api';
import { EmailService } from './services/emailService';
import { initDatabase } from './db/init';

const app = new Hono<{ Bindings: Env }>();

// CORS 配置（简化版）
app.use('*', cors({
  origin: (origin) => {
    // 默认允许任何来源（简化配置）
    return origin || '*';
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

  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext): Promise<void> {
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
