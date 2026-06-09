import { Hono } from 'hono';
import type { Env, User, Settings } from '../../types';
import { authMiddleware } from '../middleware/auth';
import { UserService } from '../services/userService';
import { SmtpService } from '../services/smtpService';
import { EmailService } from '../services/emailService';
import { SettingsService, defaultSettings } from '../services/settingsService';
import { CaptchaService } from '../services/captchaService';

const api = new Hono<{ Bindings: Env; Variables: { user: User } }>();

// ==================== 获取公共设置（无需登录） ====================
api.get('/settings/public', async (c) => {
  try {
    // 返回公共配置（不包含 secret）
    const settings = new SettingsService(c.env, 'public').getSettings();
    
    return c.json({
      oauthEnabled: (await settings).oauthEnabled,
      oauthProviders: (await settings).oauthProviders
        .filter(p => p.enabled && p.clientId)
        .map(p => ({
          name: p.name,
          label: p.label,
          enabled: p.enabled,
          clientId: p.clientId
        })),
      captchaEnabled: (await settings).captchaEnabled,
      captchaProvider: (await settings).captchaProvider,
      captchaSiteKey: (await settings).captchaSiteKey
    });
  } catch (error) {
    return c.json({ error: 'Failed to get settings' }, 500);
  }
});

// ==================== 注册 ====================
api.post('/auth/register', async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, captchaToken } = body;

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    // 检查是否需要人机验证
    const settings = await new SettingsService(c.env, 'public').getSettings();
    if (settings.captchaEnabled && settings.captchaSecretKey) {
      if (!captchaToken) {
        return c.json({ error: 'Captcha verification required' }, 400);
      }
      const captchaService = new CaptchaService(c.env, 'public', settings.captchaSecretKey);
      const valid = await captchaService.verify(captchaToken);
      if (!valid) {
        return c.json({ error: 'Captcha verification failed' }, 400);
      }
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

// ==================== 登录 ====================
api.post('/auth/login', async (c) => {
  try {
    const body = await c.req.json();
    const { email, password, captchaToken } = body;

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    // 检查是否需要人机验证
    const settings = await new SettingsService(c.env, 'public').getSettings();
    if (settings.captchaEnabled && settings.captchaSecretKey) {
      if (!captchaToken) {
        return c.json({ error: 'Captcha verification required' }, 400);
      }
      const captchaService = new CaptchaService(c.env, 'public', settings.captchaSecretKey);
      const valid = await captchaService.verify(captchaToken);
      if (!valid) {
        return c.json({ error: 'Captcha verification failed' }, 400);
      }
    }

    const userService = new UserService(c.env);
    const { user, token } = await userService.login(email, password);

    return c.json({ user, token });
  } catch (error) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
});

// ==================== OAuth 路由（使用设置中的配置） ====================
api.get('/oauth/providers', async (c) => {
  try {
    const settings = await new SettingsService(c.env, 'public').getSettings();
    const providers = settings.oauthProviders
      .filter(p => p.enabled && p.clientId)
      .map(p => ({
        name: p.name,
        label: p.label,
        enabled: true
      }));

    return c.json({ providers });
  } catch (error) {
    return c.json({ error: 'Failed to get providers' }, 500);
  }
});

api.get('/oauth/authorize', async (c) => {
  try {
    const provider = c.req.query('provider');
    const redirectUri = c.req.query('redirect_uri');
    
    if (!provider || !redirectUri) {
      return c.json({ error: 'provider and redirect_uri are required' }, 400);
    }

    const settings = await new SettingsService(c.env, 'public').getDecryptedSettings();
    const providerConfig = settings.oauthProviders.find(p => p.name === provider);
    
    if (!providerConfig || !providerConfig.enabled || !providerConfig.clientId || !providerConfig.clientSecret) {
      return c.json({ error: 'OAuth provider not configured' }, 404);
    }

    // 生成 state 用于防止 CSRF
    const state = crypto.randomUUID();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await c.env.DB.prepare(
      'INSERT INTO oauth_states (id, state, user_id, redirect_uri, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      crypto.randomUUID(),
      state,
      null,
      redirectUri,
      expiresAt,
      new Date().toISOString()
    ).run();

    let authUrl = '';
    
    if (provider === 'github') {
      const params = new URLSearchParams({
        client_id: providerConfig.clientId,
        redirect_uri: `${new URL(c.req.url).origin}/api/oauth/callback`,
        state,
        scope: providerConfig.scopes?.join(' ') || 'read:user user:email'
      });
      authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    } else if (provider === 'google') {
      const params = new URLSearchParams({
        client_id: providerConfig.clientId,
        redirect_uri: `${new URL(c.req.url).origin}/api/oauth/callback`,
        response_type: 'code',
        scope: providerConfig.scopes?.join(' ') || 'openid email profile',
        state,
        access_type: 'online',
        prompt: 'select_account'
      });
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    return c.json({ authUrl, state });
  } catch (error) {
    console.error('OAuth authorize error:', error);
    return c.json({ error: (error as Error).message }, 500);
  }
});

api.get('/oauth/callback', async (c) => {
  try {
    const provider = c.req.query('provider') || c.req.header('referer')?.includes('github') ? 'github' : 'google';
    const code = c.req.query('code');
    const state = c.req.query('state');

    if (!code || !state) {
      return c.json({ error: 'Invalid callback' }, 400);
    }

    // 验证 state
    const stateRow = await c.env.DB.prepare(
      'SELECT redirect_uri, expires_at FROM oauth_states WHERE state = ?'
    ).bind(state).first<{ redirect_uri: string; expires_at: number }>();

    if (!stateRow || stateRow.expires_at < Date.now()) {
      await c.env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
      return c.json({ error: 'Invalid or expired state' }, 400);
    }

    const redirectUri = stateRow.redirect_uri;
    await c.env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();

    // 获取设置（解密后的）
    const settings = await new SettingsService(c.env, 'public').getDecryptedSettings();
    const providerConfig = settings.oauthProviders.find(p => p.enabled && p.clientId);
    
    if (!providerConfig || !providerConfig.clientId || !providerConfig.clientSecret) {
      return c.json({ error: 'OAuth provider not configured' }, 404);
    }

    // 交换 token
    let accessToken = '';
    let email = '';

    if (provider === 'github') {
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          client_id: providerConfig.clientId,
          client_secret: providerConfig.clientSecret,
          code
        })
      });

      const tokenData = await tokenResponse.json();
      accessToken = tokenData.access_token;

      // 获取用户信息
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });
      const userData = await userResponse.json();

      if (!userData.email) {
        const emailsResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        });
        const emails = await emailsResponse.json();
        const primaryEmail = emails.find((e: { primary: boolean; email: string; verified: boolean }) => e.primary && e.verified);
        email = primaryEmail?.email || emails[0]?.email || '';
      } else {
        email = userData.email;
      }
    } else if (provider === 'google') {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: providerConfig.clientId,
          client_secret: providerConfig.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: `${new URL(c.req.url).origin}/api/oauth/callback`
        })
      });

      const tokenData = await tokenResponse.json();
      accessToken = tokenData.access_token;

      const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      const userData = await userResponse.json();
      email = userData.email;
    }

    if (!email) {
      return c.json({ error: 'Failed to get email from provider' }, 400);
    }

    // 创建或获取用户
    const userService = new UserService(c.env);
    let user = await userService.findByEmail(email);

    if (!user) {
      user = await userService.createOAuthUser(email, provider, email);
    }

    // 生成 token
    const { token } = await userService.generateToken(user.id);

    // 重定向到前端回调页面
    const frontendCallback = new URL(redirectUri);
    frontendCallback.searchParams.set('token', token.token);
    frontendCallback.searchParams.set('refreshToken', token.refreshToken);
    frontendCallback.searchParams.set('expiresAt', token.expiresAt.toString());

    return c.redirect(frontendCallback.toString());
  } catch (error) {
    console.error('OAuth callback error:', error);
    return c.json({ error: (error as Error).message }, 500);
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

// ==================== 需要登录的路由 ====================
api.use('*', authMiddleware);

api.get('/auth/me', (c) => {
  const user = c.get('user');
  return c.json({ user });
});

// ==================== 设置路由 ====================
api.get('/settings', async (c) => {
  const user = c.get('user');
  const settingsService = new SettingsService(c.env, user.id);
  const settings = await settingsService.getSettings();
  return c.json({ settings });
});

api.put('/settings', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const settings = body.settings as Settings;

  const settingsService = new SettingsService(c.env, user.id);
  await settingsService.saveSettings({
    ...defaultSettings,
    ...settings,
    updatedAt: new Date().toISOString()
  });

  const updated = await settingsService.getSettings();
  return c.json({ settings: updated });
});

// ==================== SMTP 配置路由 ====================
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

// ==================== 邮件模板路由 ====================
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

// ==================== 邮件发送路由 ====================
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

// ==================== 统计路由 ====================
api.get('/metrics', async (c) => {
  const user = c.get('user');
  const emailService = new EmailService(c.env, user.id);
  const metrics = await emailService.getMetrics();
  return c.json({ metrics });
});

export default api;