import { Hono } from 'hono';
import type { Env, User } from '../../types';
import { authMiddleware } from '../middleware/auth';
import { UserService } from '../services/userService';
import { SmtpService } from '../services/smtpService';
import { EmailService } from '../services/emailService';
import { OAuthService } from '../services/oauthService';

const api = new Hono<{ Bindings: Env; Variables: { user: User } }>();

// 认证路由
api.post('/auth/register', async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    const userService = new UserService(c.env);
    const user = await userService.register(email, password);
    const { user: loggedInUser, token } = await userService.login(email, password);

    return c.json({ user: loggedInUser, token });
  } catch (error) {
    if ((error as Error).message === 'User already exists') {
      return c.json({ error: 'User already exists' }, 409);
    }
    return c.json({ error: 'Registration failed' }, 500);
  }
});

api.post('/auth/login', async (c) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    const userService = new UserService(c.env);
    const { user, token } = await userService.login(email, password);

    return c.json({ user, token });
  } catch (error) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
});

api.post('/auth/refresh', async (c) => {
  try {
    const { refreshToken } = await c.req.json();
    if (!refreshToken) {
      return c.json({ error: 'Refresh token is required' }, 400);
    }

    const userService = new UserService(c.env);
    const { user, token } = await userService.refreshToken(refreshToken);

    return c.json({ user, token });
  } catch (error) {
    return c.json({ error: 'Invalid refresh token' }, 401);
  }
});

// OAuth 路由
api.get('/oauth/authorize', async (c) => {
  try {
    const provider = c.req.query('provider');
    const redirectUri = c.req.query('redirect_uri');
    
    if (!provider || !redirectUri) {
      return c.json({ error: 'provider and redirect_uri are required' }, 400);
    }

    const oauthService = new OAuthService(c.env);
    const authUrl = await oauthService.getAuthorizationUrl(provider, redirectUri);

    return c.json({ authUrl });
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

api.get('/oauth/callback', async (c) => {
  try {
    const provider = c.req.query('provider');
    const code = c.req.query('code');
    const state = c.req.query('state');

    if (!provider || !code || !state) {
      return c.json({ error: 'provider, code, and state are required' }, 400);
    }

    const oauthService = new OAuthService(c.env);
    const oauthState = await oauthService.getState(state);

    if (!oauthState || oauthState.expiresAt < Date.now()) {
      return c.json({ error: 'Invalid or expired state' }, 400);
    }

    const tokenResponse = await oauthService.exchangeCode(provider, code, oauthState.redirectUri);
    await oauthService.deleteState(state);

    const userService = new UserService(c.env);
    let user = await userService.findByEmail(tokenResponse.email);

    if (!user) {
      user = await userService.createOAuthUser(tokenResponse.email, provider, tokenResponse.providerUserId);
    }

    const { token } = await userService.generateToken(user.id);

    return c.redirect(`${oauthState.redirectUri}?token=${token.token}&refreshToken=${token.refreshToken}&expiresAt=${token.expiresAt}`);
  } catch (error) {
    return c.json({ error: (error as Error).message }, 500);
  }
});

api.get('/oauth/providers', async (c) => {
  const providers = [
    {
      name: 'github',
      label: 'GitHub',
      enabled: !!c.env.GITHUB_CLIENT_ID && !!c.env.GITHUB_CLIENT_SECRET
    },
    {
      name: 'google',
      label: 'Google',
      enabled: !!c.env.GOOGLE_CLIENT_ID && !!c.env.GOOGLE_CLIENT_SECRET
    }
  ];

  return c.json({ providers });
});

// 受保护的路由
api.use('*', authMiddleware);

api.get('/auth/me', (c) => {
  const user = c.get('user');
  return c.json({ user });
});

// SMTP 配置路由
api.get('/smtp-configs', async (c) => {
  const user = c.get('user');
  const smtpService = new SmtpService(c.env, user.id);
  const configs = await smtpService.findAll();
  return c.json({ configs });
});

api.get('/smtp-configs/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const smtpService = new SmtpService(c.env, user.id);
  const config = await smtpService.findById(id);
  if (!config) {
    return c.json({ error: 'Config not found' }, 404);
  }
  return c.json({ config });
});

api.post('/smtp-configs', async (c) => {
  const user = c.get('user');
  const data = await c.req.json();
  const smtpService = new SmtpService(c.env, user.id);
  const config = await smtpService.create(data);
  return c.json({ config }, 201);
});

api.put('/smtp-configs/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const data = await c.req.json();
  const smtpService = new SmtpService(c.env, user.id);
  const config = await smtpService.update(id, data);
  return c.json({ config });
});

api.delete('/smtp-configs/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const smtpService = new SmtpService(c.env, user.id);
  await smtpService.delete(id);
  return c.json({ success: true });
});

// 邮件模板路由
api.get('/templates', async (c) => {
  const user = c.get('user');
  const emailService = new EmailService(c.env, user.id);
  const templates = await emailService.listTemplates();
  return c.json({ templates });
});

api.get('/templates/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const emailService = new EmailService(c.env, user.id);
  const template = await emailService.getTemplate(id);
  if (!template) {
    return c.json({ error: 'Template not found' }, 404);
  }
  return c.json({ template });
});

api.post('/templates', async (c) => {
  const user = c.get('user');
  const data = await c.req.json();
  const emailService = new EmailService(c.env, user.id);
  const template = await emailService.createTemplate(data);
  return c.json({ template }, 201);
});

api.put('/templates/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const data = await c.req.json();
  const emailService = new EmailService(c.env, user.id);
  const template = await emailService.updateTemplate(id, data);
  return c.json({ template });
});

api.delete('/templates/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const emailService = new EmailService(c.env, user.id);
  await emailService.deleteTemplate(id);
  return c.json({ success: true });
});

// 邮件发送路由
api.post('/emails', async (c) => {
  const user = c.get('user');
  const data = await c.req.json();
  const emailService = new EmailService(c.env, user.id);
  const result = await emailService.sendEmail(data);
  return c.json(result, 202);
});

api.get('/emails', async (c) => {
  const user = c.get('user');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');
  const emailService = new EmailService(c.env, user.id);
  const history = await emailService.listHistory(limit, offset);
  return c.json({ history });
});

api.get('/emails/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const emailService = new EmailService(c.env, user.id);
  const email = await emailService.getHistory(id);
  if (!email) {
    return c.json({ error: 'Email not found' }, 404);
  }
  return c.json({ email });
});

// 统计路由
api.get('/metrics', async (c) => {
  const user = c.get('user');
  const emailService = new EmailService(c.env, user.id);
  const metrics = await emailService.getMetrics();
  return c.json({ metrics });
});

export default api;
