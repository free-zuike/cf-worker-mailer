import { Hono } from 'hono';
import type { Env, User } from '../../types';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { UserService } from '../services/userService';
import { SmtpService } from '../services/smtpService';
import { EmailService } from '../services/emailService';
import { SettingsService } from '../services/settingsService';
import { PreferencesService } from '../services/preferencesService';
import { CaptchaService } from '../services/captchaService';
import { OAuthService } from '../services/oauthService';

const api = new Hono<{ Bindings: Env; Variables: { user: User } }>();

// ==================== 认证路由 ====================
api.post('/auth/register', async (c) => {
  try {
    const { email, password, captchaToken } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    // 验证人机验证
    const settings = new SettingsService(c.env);
    const settingsData = await settings.getSettings();
    if (settingsData.captcha.enabled && settingsData.captcha.secretKey) {
      if (!captchaToken) {
        return c.json({ error: 'Captcha verification required' }, 400);
      }
      const captchaService = new CaptchaService(c.env, settingsData.captcha.secretKey);
      const captchaResult = await captchaService.verify(captchaToken);
      if (!captchaResult) {
        return c.json({ error: 'Captcha verification failed' }, 400);
      }
    }

    const userService = new UserService(c.env);
    await userService.register(email, password);
    const { user, token } = await userService.login(email, password);

    return c.json({ user, token });
  } catch (error) {
    if ((error as Error).message === 'User already exists') {
      return c.json({ error: 'User already exists' }, 409);
    }
    return c.json({ error: 'Registration failed' }, 500);
  }
});

api.post('/auth/login', async (c) => {
  try {
    const { email, password, captchaToken } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    // 验证人机验证
    const settings = new SettingsService(c.env);
    const settingsData = await settings.getSettings();
    if (settingsData.captcha.enabled && settingsData.captcha.secretKey) {
      if (!captchaToken) {
        return c.json({ error: 'Captcha verification required' }, 400);
      }
      const captchaService = new CaptchaService(c.env, settingsData.captcha.secretKey);
      const captchaResult = await captchaService.verify(captchaToken);
      if (!captchaResult) {
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

// ==================== OAuth Callback 路由 ====================
api.get('/oauth/callback', async (c) => {
  try {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
      return c.redirect(`/login?error=${encodeURIComponent(error)}`, 302);
    }

    if (!code || !state) {
      return c.redirect('/login?error=missing_parameters', 302);
    }

    const oauthService = new OAuthService(c.env);
    const settingsService = new SettingsService(c.env);
    const userService = new UserService(c.env);

    // 获取存储的 state 信息
    const stateData = await oauthService.getState(state);
    if (!stateData) {
      return c.redirect('/login?error=invalid_state', 302);
    }

    // 获取 provider 配置
    const settings = await settingsService.getSettings();
    const provider = settings.oauth.providers.find(p => p.name === stateData.provider);
    if (!provider || !provider.enabled) {
      return c.redirect('/login?error=provider_disabled', 302);
    }

    // 交换 code 获取用户信息
    const { email } = await oauthService.exchangeCode(
      provider,
      code,
      stateData.redirectUri,
      stateData.codeVerifier
    );

    // 删除已使用的 state
    await oauthService.deleteState(state);

    // 查找或创建用户
    let user = await userService.findByEmail(email);
    if (!user) {
      // 创建新用户（随机密码）
      const randomPassword = crypto.randomUUID();
      await userService.register(email, randomPassword);
      user = await userService.findByEmail(email);
    }

    // 生成 token
    const { token } = await userService.createToken(user!);

    // 重定向回前端并携带 token
    const redirectUrl = new URL('/oauth-callback', stateData.redirectUri);
    redirectUrl.searchParams.set('token', token.token);
    redirectUrl.searchParams.set('refreshToken', token.refreshToken);
    redirectUrl.searchParams.set('expiresAt', token.expiresAt.toString());

    return c.redirect(redirectUrl.toString(), 302);
  } catch (error) {
    console.error('OAuth callback error:', error);
    return c.redirect(`/login?error=${encodeURIComponent((error as Error).message)}`, 302);
  }
});

// ==================== 公开设置（无需登录，用于登录/注册页面） ====================
api.get('/settings/public', async (c) => {
  try {
    const settings = new SettingsService(c.env);
    const s = await settings.getSettings();
    return c.json({
      oauthEnabled: s.oauth.enabled,
      oauthProviders: s.oauth.providers
        .filter(p => p.enabled && p.clientId)
        .map(p => ({ name: p.name, label: p.label, enabled: p.enabled, clientId: p.clientId, issuer: p.issuer })),
      captchaEnabled: s.captcha.enabled,
      captchaSiteKey: s.captcha.siteKey
    });
  } catch (error) {
    return c.json({ error: 'Failed to get settings' }, 500);
  }
});

// ==================== 受保护的路由（需要登录） ====================
api.use('*', authMiddleware);

api.get('/auth/me', (c) => {
  const user = c.get('user');
  return c.json({ user });
});

// ==================== 用户偏好路由（所有人可用） ====================
api.get('/user/preferences', async (c) => {
  const user = c.get('user');
  const prefsService = new PreferencesService(c.env, user.id);
  const prefs = await prefsService.getPreferences();
  return c.json({ preferences: prefs });
});

api.put('/user/preferences', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const prefsService = new PreferencesService(c.env, user.id);
  const prefs = await prefsService.savePreferences(body.preferences ?? {});
  return c.json({ preferences: prefs });
});

// ==================== 系统设置路由（仅管理员） ====================
// 获取系统设置
api.get('/settings', adminMiddleware, async (c) => {
  const settings = new SettingsService(c.env);
  const s = await settings.getDecryptedSettings();
  return c.json({ settings: s });
});

// 保存人机验证设置（独立接口）
api.put('/settings/captcha', adminMiddleware, async (c) => {
  const body = await c.req.json();
  const settings = new SettingsService(c.env);
  const captcha = await settings.saveCaptchaSettings(body.captcha ?? { enabled: false, siteKey: '', secretKey: '' });
  return c.json({ captcha });
});

// 保存 OAuth 设置（独立接口）
api.put('/settings/oauth', adminMiddleware, async (c) => {
  const body = await c.req.json();
  const settings = new SettingsService(c.env);
  const oauth = await settings.saveOAuthSettings(body.oauth ?? { enabled: false, providers: [] });
  return c.json({ oauth });
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
