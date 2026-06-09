import type { Env } from '../../types';

export interface OAuthProviderConfig {
  name: string;
  label: string;
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
}

export class GitHubOAuthService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  // 创建 OAuth 状态
  async createState(redirectUri: string): Promise<{ state: string; codeVerifier: string }> {
    const state = crypto.randomUUID();
    const codeVerifier = this.generateCodeVerifier();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await this.env.DB.prepare(
      'INSERT INTO oauth_states (id, state, user_id, redirect_uri, provider, code_verifier, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      crypto.randomUUID(),
      state,
      null,
      redirectUri,
      'github',
      codeVerifier,
      expiresAt,
      new Date().toISOString()
    ).run();

    return { state, codeVerifier };
  }

  // 获取存储的状态
  async getState(state: string): Promise<{ redirectUri: string; codeVerifier: string } | null> {
    const row = await this.env.DB.prepare(
      'SELECT redirect_uri, code_verifier FROM oauth_states WHERE state = ? AND expires_at > ? AND provider = ?'
    ).bind(state, Date.now(), 'github').first<{
      redirect_uri: string;
      code_verifier: string;
    }>();

    if (!row) return null;
    return { redirectUri: row.redirect_uri, codeVerifier: row.code_verifier };
  }

  // 删除已使用的状态
  async deleteState(state: string): Promise<void> {
    await this.env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
  }

  // 获取 GitHub 授权 URL
  async getAuthorizeUrl(clientId: string, redirectUri: string): Promise<string> {
    const { state, codeVerifier } = await this.createState(redirectUri);
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'read:user user:email',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  // 交换 code 获取用户信息
  async exchangeCode(
    clientId: string,
    clientSecret: string,
    code: string,
    redirectUri: string
  ): Promise<{ email: string; githubUserId: string; name?: string; avatarUrl?: string }> {
    // 用 code 换取 access_token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      })
    });

    if (!tokenResponse.ok) {
      throw new Error(`GitHub token exchange failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json() as { access_token?: string; error?: string };
    
    if (tokenData.error) {
      throw new Error(`GitHub OAuth error: ${tokenData.error}`);
    }

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      throw new Error('No access token received from GitHub');
    }

    // 获取用户信息
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!userResponse.ok) {
      throw new Error(`Failed to get GitHub user: ${userResponse.status}`);
    }

    const githubUser = await userResponse.json() as { id: number; login: string; avatar_url?: string; name?: string };

    // 获取用户邮箱（如果主要邮箱不可见）
    let email = '';
    const emailsResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (emailsResponse.ok) {
      const emails = await emailsResponse.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
      // 优先获取主要邮箱
      const primaryEmail = emails.find(e => e.primary && e.verified);
      const anyVerifiedEmail = emails.find(e => e.verified);
      email = primaryEmail?.email || anyVerifiedEmail?.email || '';
    }

    // 如果还是没有邮箱，用 GitHub login 生成一个
    if (!email) {
      email = `${githubUser.login}@github.placeholder`;
    }

    return {
      email,
      githubUserId: githubUser.id.toString(),
      name: githubUser.name || githubUser.login,
      avatarUrl: githubUser.avatar_url
    };
  }

  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return this.base64urlEncode(array);
  }

  private async generateCodeChallenge(codeVerifier: string): Promise<string> {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return this.base64urlEncode(new Uint8Array(digest));
  }

  private base64urlEncode(array: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...array));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}
