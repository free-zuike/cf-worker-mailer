import { Hono } from 'hono';
import type { Env, User } from '../../types';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { UserService } from '../services/userService';
import { SmtpService } from '../services/smtpService';
import { EmailService } from '../services/emailService';
import { SettingsService } from '../services/settingsService';
import { PreferencesService } from '../services/preferencesService';
import { CaptchaService } from '../services/captchaService';
import { GitHubOAuthService } from '../services/githubOAuthService';

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

// ==================== GitHub OAuth 路由 ====================

// 获取 GitHub OAuth 授权 URL
api.get('/auth/github', async (c) => {
  try {
    const settings = new SettingsService(c.env);
    const s = await settings.getSettings();
    
    if (!s.oauth.enabled) {
      return c.json({ error: 'GitHub OAuth is not enabled' }, 400);
    }

    const githubProvider = s.oauth.providers.find(p => p.name === 'github');
    if (!githubProvider || !githubProvider.enabled || !githubProvider.clientId) {
      return c.json({ error: 'GitHub OAuth is not configured' }, 400);
    }

    const githubService = new GitHubOAuthService(c.env);
    const baseUrl = new URL(c.req.url).origin;
    const redirectUri = `${baseUrl}/api/auth/github/callback`;
    
    const authUrl = await githubService.getAuthorizeUrl(githubProvider.clientId, redirectUri);
    
    return c.json({ authUrl });
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    return c.json({ error: 'Failed to generate GitHub OAuth URL' }, 500);
  }
});

// GitHub OAuth 回调
api.get('/auth/github/callback', async (c) => {
  try {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
      return c.redirect('/login?error=github_auth_denied', 302);
    }

    if (!code || !state) {
      return c.redirect('/login?error=missing_parameters', 302);
    }

    const settingsService = new SettingsService(c.env);
    const settings = await settingsService.getSettings();
    const githubProvider = settings.oauth.providers.find(p => p.name === 'github');
    
    if (!githubProvider || !githubProvider.enabled || !githubProvider.clientId || !githubProvider.clientSecret) {
      return c.redirect('/login?error=github_not_configured', 302);
    }

    const githubService = new GitHubOAuthService(c.env);
    const userService = new UserService(c.env);

    // 验证 state
    const baseUrl = new URL(c.req.url).origin;
    const redirectUri = `${baseUrl}/api/auth/github/callback`;
    const stateData = await githubService.getState(state);
    
    if (!stateData) {
      return c.redirect('/login?error=invalid_state', 302);
    }

    // 交换 code 获取用户信息
    const githubUser = await githubService.exchangeCode(
      githubProvider.clientId,
      githubProvider.clientSecret,
      code,
      redirectUri
    );

    // 删除已使用的 state
    await githubService.deleteState(state);

    // 查找或创建用户（使用 GitHub 用户 ID 作为唯一标识）
    let user = await userService.findByGithubId(githubUser.githubUserId);
    
    if (!user) {
      // 尝试通过邮箱查找
      user = await userService.findByEmail(githubUser.email);
      
      if (!user) {
        // 创建新用户（随机密码，因为使用 GitHub 登录）
        const randomPassword = crypto.randomUUID();
        user = await userService.registerWithGithub(
          githubUser.email,
          randomPassword,
          githubUser.githubUserId,
          githubUser.name,
          githubUser.avatarUrl
        );
      } else {
        // 更新现有用户，关联 GitHub 账户
        await userService.linkGithub(user.id, githubUser.githubUserId, githubUser.avatarUrl);
      }
    }

    // 生成 token
    const { token } = await userService.createToken(user!);

    // 重定向回前端
    const redirectUrl = new URL('/oauth-callback', baseUrl);
    redirectUrl.searchParams.set('token', token.token);
    redirectUrl.searchParams.set('refreshToken', token.refreshToken);
    redirectUrl.searchParams.set('expiresAt', token.expiresAt.toString());

    return c.redirect(redirectUrl.toString(), 302);
  } catch (error) {
    console.error('GitHub OAuth callback error:', error);
    return c.redirect(`/login?error=${encodeURIComponent((error as Error).message)}`, 302);
  }
});

// ==================== 公开设置（无需登录，用于登录/注册页面） ====================
api.get('/settings/public', async (c) => {
  try {
    const settings = new SettingsService(c.env);
    const s = await settings.getSettings();
    return c.json({
      githubOAuthEnabled: s.oauth.enabled && s.oauth.providers.some(p => p.name === 'github' && p.enabled && p.clientId),
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

// 保存 GitHub OAuth 设置（独立接口）
api.put('/settings/github', adminMiddleware, async (c) => {
  const body = await c.req.json();
  const settings = new SettingsService(c.env);
  const oauth = await settings.saveOAuthSettings({
    enabled: body.enabled ?? false,
    providers: [{
      name: 'github',
      label: body.label ?? 'GitHub',
      enabled: body.enabled ?? false,
      clientId: body.clientId ?? '',
      clientSecret: body.clientSecret ?? '',
      scopes: ['read:user', 'user:email']
    }]
  });
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
  const limitParam = parseInt(c.req.query('limit') || '50');
  const offsetParam = parseInt(c.req.query('offset') || '0');
  const limit = isNaN(limitParam) || limitParam < 1 ? 50 : Math.min(limitParam, 100);
  const offset = isNaN(offsetParam) || offsetParam < 0 ? 0 : offsetParam;
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

// ==================== API Key 路由 ====================
api.post('/api-key/generate', async (c) => {
  const user = c.get('user');
  const userService = new UserService(c.env);
  const apiKey = await userService.generateApiKey(user.id);
  return c.json({ apiKey });
});

export default api;
