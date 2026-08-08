import { Hono } from 'hono';
import type { Env, User } from '../../types';
import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { SettingsService } from '../services/settingsService';

const settings = new Hono<{ Bindings: Env; Variables: { user: User } }>();

// 公开设置（无需登录）
settings.get('/public', async (c) => {
  try {
    const s = new SettingsService(c.env);
    const data = await s.getSettings();
    return c.json({
      githubOAuthEnabled: data.oauth.enabled && data.oauth.providers.some(p => p.name === 'github' && p.enabled && p.clientId),
      captchaEnabled: data.captcha.enabled,
      captchaSiteKey: data.captcha.siteKey
    });
  } catch (error) {
    return c.json({ error: 'Failed to get settings' }, 500);
  }
});

// 管理员：获取系统设置（解密后）
settings.get('/', authMiddleware, adminMiddleware, async (c) => {
  const s = new SettingsService(c.env);
  const data = await s.getDecryptedSettings();
  return c.json({ settings: data });
});

// 管理员：保存人机验证设置
settings.put('/captcha', authMiddleware, adminMiddleware, async (c) => {
  const body = await c.req.json();
  const s = new SettingsService(c.env);
  const captcha = await s.saveCaptchaSettings(body.captcha ?? { enabled: false, siteKey: '', secretKey: '' });
  return c.json({ captcha });
});

// 管理员：保存 GitHub OAuth 设置
settings.put('/github', authMiddleware, adminMiddleware, async (c) => {
  const body = await c.req.json();
  const s = new SettingsService(c.env);
  const oauth = await s.saveOAuthSettings({
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

export default settings;