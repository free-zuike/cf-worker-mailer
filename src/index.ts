import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from '../types';
import api from './routes/api';
import { EmailService } from './services/emailService';
import { initDatabase } from './db/init';

const app = new Hono<{ Bindings: Env }>();

// 全局错误处理
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ error: 'Internal Server Error', details: err.message }, 500);
});

// CORS 配置（简化版，避免在定义阶段访问环境变量）
app.use('*', cors({
  origin: (origin) => {
    // 默认允许本地开发和任何来源（简化配置）
    if (!origin) return '*';
    return origin;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true
}));

// 健康检查
app.get('/health', async (c) => {
  try {
    await initDatabase(c.env);
    return c.json({ status: 'ok', timestamp: new Date().toISOString(), database: 'initialized' });
  } catch (error) {
    return c.json({ status: 'error', timestamp: new Date().toISOString(), error: (error as Error).message }, 500);
  }
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
