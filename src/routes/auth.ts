import { Hono } from 'hono';
import type { Env, User } from '../../types';
import { authMiddleware } from '../middleware/auth';
import { UserService } from '../services/userService';
import { SettingsService } from '../services/settingsService';
import { CaptchaService } from '../services/captchaService';
import { GitHubOAuthService } from '../services/githubOAuthService';

const auth = new Hono<{ Bindings: Env; Variables: { user: User } }>();

/** 验证人机验证（未启用或未配置时跳过） */
async function verifyCaptchaIfEnabled(env: Env, captchaToken?: string): Promise<string | null> {
  const settings = new SettingsService(env);
  const settingsData = await settings.getSettings();
  if (settingsData.captcha.enabled && settingsData.captcha.secretKey) {
    if (!captchaToken) {
      return 'Captcha verification required';
    }
    const captchaService = new CaptchaService(env, settingsData.captcha.secretKey);
    const captchaResult = await captchaService.verify(captchaToken);
    if (!captchaResult) {
      return 'Captcha verification failed';
    }
  }
  return null;
}

auth.post('/register', async (c) => {
  try {
    const { email, password, captchaToken } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    const captchaError = await verifyCaptchaIfEnabled(c.env, captchaToken);
    if (captchaError) {
      return c.json({ error: captchaError }, 400);
    }

    const userService = new UserService(c.env);
    await userService.register(email, password);
    const { user, token } = await userService.login(email, password);

    return c.json({ user, token });
  } catch (error) {
    if (error instanceof Error && error.message === 'User already exists') {
      return c.json({ error: 'User already exists' }, 409);
    }
    return c.json({ error: 'Registration failed' }, 500);
  }
});

auth.post('/login', async (c) => {
  try {
    const { email, password, captchaToken } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    const captchaError = await verifyCaptchaIfEnabled(c.env, captchaToken);
    if (captchaError) {
      return c.json({ error: captchaError }, 400);
    }

    const userService = new UserService(c.env);
    const { user, token } = await userService.login(email, password);

    return c.json({ user, token });
  } catch (error) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
});

auth.post('/refresh', async (c) => {
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

auth.get('/github', async (c) => {
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

auth.get('/github/callback', async (c) => {
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

// ==================== 受保护的路由（需要登录） ====================
auth.use('*', authMiddleware);

auth.get('/me', (c) => {
  const user = c.get('user');
  return c.json({ user });
});

export default auth;