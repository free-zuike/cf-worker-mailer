import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from '../types';
import api from './routes/api';
import { EmailService } from './services/emailService';

const app = new Hono<{ Bindings: Env }>();

// CORS 配置
app.use('*', cors({
  origin: (origin) => {
    // 允许的来源列表，可通过环境变量配置
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
    if (allowedOrigins.length === 0) {
      // 默认允许本地开发
      if (origin && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
        return origin;
      }
      return ''; // 不允许其他来源
    }
    return allowedOrigins.includes(origin) ? origin : '';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
}));

// 健康检查
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API 路由
app.route('/api', api);

// 静态资源（前端）
app.get('*', async (c) => {
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
