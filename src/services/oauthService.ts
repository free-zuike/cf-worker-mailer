import type { Env, OAuthState, OAuthTokenResponse } from '../../types';

export class OAuthService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async createState(redirectUri: string, userId?: string): Promise<string> {
    const state = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000;

    await this.env.DB.prepare(
      'INSERT INTO oauth_states (id, state, user_id, redirect_uri, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(
        crypto.randomUUID(),
        state,
        userId || null,
        redirectUri,
        expiresAt,
        new Date(now).toISOString()
      )
      .run();

    return state;
  }

  async getState(state: string): Promise<OAuthState | null> {
    const row = await this.env.DB.prepare(
      'SELECT id, state, user_id, redirect_uri, expires_at, created_at FROM oauth_states WHERE state = ?'
    ).bind(state).first<{
      id: string;
      state: string;
      user_id?: string;
      redirect_uri: string;
      expires_at: number;
      created_at: string;
    }>();

    if (!row) return null;

    return {
      id: row.id,
      state: row.state,
      userId: row.user_id,
      redirectUri: row.redirect_uri,
      expiresAt: row.expires_at,
      createdAt: row.created_at
    };
  }

  async deleteState(state: string): Promise<void> {
    await this.env.DB.prepare(
      'DELETE FROM oauth_states WHERE state = ?'
    ).bind(state).run();
  }

  async getAuthorizationUrl(provider: string, redirectUri: string, userId?: string): Promise<string> {
    const state = await this.createState(redirectUri, userId);
    
    const providers: Record<string, { authUrl: string; clientId: string; scopes: string }> = {
      github: {
        authUrl: 'https://github.com/login/oauth/authorize',
        clientId: this.env.GITHUB_CLIENT_ID || '',
        scopes: 'user:email'
      },
      google: {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        clientId: this.env.GOOGLE_CLIENT_ID || '',
        scopes: 'openid email profile'
      }
    };

    const config = providers[provider.toLowerCase()];
    if (!config || !config.clientId) {
      throw new Error(`OAuth provider ${provider} not configured`);
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: config.scopes,
      state: state,
      access_type: 'online',
      prompt: 'select_account'
    });

    return `${config.authUrl}?${params.toString()}`;
  }

  async exchangeCode(provider: string, code: string, redirectUri: string): Promise<OAuthTokenResponse> {
    const providers: Record<string, { tokenUrl: string; clientId: string; clientSecret: string }> = {
      github: {
        tokenUrl: 'https://github.com/login/oauth/access_token',
        clientId: this.env.GITHUB_CLIENT_ID || '',
        clientSecret: this.env.GITHUB_CLIENT_SECRET || ''
      },
      google: {
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientId: this.env.GOOGLE_CLIENT_ID || '',
        clientSecret: this.env.GOOGLE_CLIENT_SECRET || ''
      }
    };

    const config = providers[provider.toLowerCase()];
    if (!config || !config.clientId || !config.clientSecret) {
      throw new Error(`OAuth provider ${provider} not configured`);
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    const tokenData = await response.json();
    
    if (!tokenData.access_token) {
      throw new Error('Failed to exchange code for token');
    }

    const userInfo = await this.getUserInfo(provider, tokenData.access_token);

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : Date.now() + 3600 * 1000,
      provider: provider,
      providerUserId: userInfo.id,
      email: userInfo.email
    };
  }

  private async getUserInfo(provider: string, accessToken: string): Promise<{ id: string; email: string }> {
    const endpoints: Record<string, string> = {
      github: 'https://api.github.com/user',
      google: 'https://www.googleapis.com/oauth2/v3/userinfo'
    };

    const endpoint = endpoints[provider.toLowerCase()];
    if (!endpoint) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const userData = await response.json();

    if (provider === 'github') {
      return {
        id: userData.id.toString(),
        email: userData.email || await this.getGitHubEmail(accessToken)
      };
    }

    return {
      id: userData.sub || userData.id,
      email: userData.email
    };
  }

  private async getGitHubEmail(accessToken: string): Promise<string> {
    const response = await fetch('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const emails = await response.json();
    const primaryEmail = emails.find((e: { primary: boolean; email: string }) => e.primary);
    return primaryEmail?.email || emails[0]?.email || '';
  }
}