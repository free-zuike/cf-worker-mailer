import { Hono } from 'hono';
import type { Env, User, Settings } from '../../types';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { UserService } from '../services/userService';
import { SmtpService } from '../services/smtpService';
import { EmailService } from '../services/emailService';
import { SettingsService, defaultSettings } from '../services/settingsService';
import { CaptchaService } from '../services/captchaService';
import { OAuthService } from '../services/oauthService';

const api = new Hono<{ Bindings: Env; Variables: { user: User } }>();

// ==================== 获取公共设置（无需登录） ====================
api.get('/settings/public', async (c) => {
  try {
    const settings = await new SettingsService(c.env).getSettings();

    return c.json({
      oauthEnabled: settings.oauthEnabled,
      oauthProviders: settings.oauthProviders
        .filter(p => p.enabled && p.clientId)
        .map(p => ({
          name: p.name,
          label: p.label,
          enabled: p.enabled,
          clientId: p.clientId,
          type: (p as any).type || 'oidc',
          issuer: (p as any).issuer || ''
        })),
      captchaEnabled: settings.captchaEnabled,
      captchaProvider: settings.captchaProvider,
      captchaSiteKey: settings.captchaSiteKey
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
    const settings = await new SettingsService(c.env).getSettings();
    if (settings.captchaEnabled && settings.captchaSecretKey) {
      if (!captchaToken) {
        return c.json({ error: 'Captcha verification required' }, 400);
      }
      const captchaService = new CaptchaService(c.env, settings.captchaSecretKey);
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
    const settings = await new SettingsService(c.env).getSettings();
    if (settings.captchaEnabled && settings.captchaSecretKey) {
      if (!captchaToken) {
        return c.json({ error: 'Captcha verification required' }, 400);
      }
      const captchaService = new CaptchaService(c.env, settings.captchaSecretKey);
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

// ==================== OAuth 路由（使用通用 OpenAuth 实现，从用户设置读取） ====================
api.get('/oauth/providers', async (c) => {
  try {
    const settings = await new SettingsService(c.env).getSettings();
    const providers = settings.oauthProviders
      .filter(p => p.enabled && p.clientId)
      .map(p => ({
        name: p.name,
        label: p.label,
        enabled: true,
        type: (p as any).type || 'oidc'
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

    const settings = await new SettingsService(c.env).getDecryptedSettings();
    const providerConfig = settings.oauthProviders.find(p => p.name === provider) as any;

    if (!providerConfig || !providerConfig.enabled || !providerConfig.clientId || !providerConfig.clientSecret) {
      return c.json({ error: 'OAuth provider not configured' }, 404);
    }

    const oauthService = new OAuthService(c.env);
    const authUrl = await oauthService.getAuthorizeUrl(
      {
        name: providerConfig.name,
        label: providerConfig.label,
        enabled: providerConfig.enabled,
        clientId: providerConfig.clientId,
        clientSecret: providerConfig.clientSecret,
        scopes: providerConfig.scopes,
        type: providerConfig.type || 'oidc',
        issuer: providerConfig.issuer
      },
      redirectUri
    );

    return c.json({ authUrl });
  } catch (error) {
    console.error('OAuth authorize error:', error);
    return c.json({ error: (error as Error).message }, 500);
  }
});

api.get('/oauth/callback', async (c) => {
  try {
    const code = c.req.query('code');
    const state = c.req.query('state');

    if (!code || !state) {
      return c.json({ error: 'Invalid callback: code and state required' }, 400);
    }

    // 从 state 反查 provider 和 redirectUri
    const oauthService = new OAuthService(c.env);
    const stateData = await oauthService.getState(state);

    if (!stateData) {
      return c.json({ error: 'Invalid or expired state' }, 400);
    }

    const provider = stateData.provider;
    const redirectUri = stateData.redirectUri;
    await oauthService.deleteState(state);

    // 获取对应 provider 的配置
    const settings = await new SettingsService(c.env).getDecryptedSettings();
    const providerConfig = settings.oauthProviders.find(p => p.name === provider) as any;

    if (!providerConfig || !providerConfig.clientId || !providerConfig.clientSecret) {
      return c.json({ error: 'OAuth provider not configured' }, 404);
    }

    // 用通用实现交换 code
    const { email, providerUserId } = await oauthService.exchangeCode(
      {
        name: providerConfig.name,
        label: providerConfig.label,
        enabled: providerConfig.enabled,
        clientId: providerConfig.clientId,
        clientSecret: providerConfig.clientSecret,
        scopes: providerConfig.scopes,
        type: providerConfig.type || 'oidc',
        issuer: providerConfig.issuer
      },
      code,
      redirectUri,
      stateData.codeVerifier
    );

    if (!email) {
      return c.json({ error: 'Failed to get email from provider' }, 400);
    }

    // 创建或获取用户
    const userService = new UserService(c.env);
    let user = await userService.findByEmail(email);

    if (!user) {
      user = await userService.createOAuthUser(email, provider, providerUserId);
    }

    // 生成 token
    const { token } = await userService.generateToken(user.id);

    // 重定向回前端
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

// ==================== 设置路由（全局系统设置，写入需要管理员权限） ====================
// 读取设置（任何已登录用户可读（不包含 secret）
api.get('/settings', async (c) => {
  const user = c.get('user');
  const settingsService = new SettingsService(c.env);
  const settings = await settingsService.getSettings();

  // 管理员返回解密后的完整配置（能看到 Secret），普通用户返回脱敏版本
  if (user.role === 'admin') {
    return c.json({ settings: await settingsService.getDecryptedSettings() });
  }

  return c.json({
    settings: {
      ...settings,
      captchaSecretKey: '',
      oauthProviders: settings.oauthProviders.map(p => ({
        ...p,
        clientSecret: ''
      }))
    }
  });
});

// 修改设置：只有管理员
api.put('/settings', adminMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const settings = body.settings as Settings;

  const settingsService = new SettingsService(c.env);
  const updated = await settingsService.saveSettings(settings, true);
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