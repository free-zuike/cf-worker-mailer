import type { Env } from '../../types';

export interface OAuthProviderConfig {
  name: string;
  label: string;
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  type: 'oidc';
  issuer?: string;
}

// 解析 /.well-known/openid-configuration 返回的端点
interface OpenIdDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
}

export class OAuthService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async createState(
    redirectUri: string,
    provider: string
  ): Promise<{ state: string; codeVerifier: string }> {
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
      provider,
      codeVerifier,
      expiresAt,
      new Date().toISOString()
    ).run();

    return { state, codeVerifier };
  }

  async getState(
    state: string
  ): Promise<{ redirectUri: string; provider: string; codeVerifier: string } | null> {
    const row = await this.env.DB.prepare(
      'SELECT redirect_uri, provider, code_verifier FROM oauth_states WHERE state = ? AND expires_at > ?'
    ).bind(state, Date.now()).first<{
      redirect_uri: string;
      provider: string;
      code_verifier: string;
    }>();

    if (!row) return null;
    return { redirectUri: row.redirect_uri, provider: row.provider, codeVerifier: row.code_verifier };
  }

  async deleteState(state: string): Promise<void> {
    await this.env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
  }

  async getAuthorizeUrl(
    providerConfig: OAuthProviderConfig,
    redirectUri: string
  ): Promise<string> {
    if (!providerConfig.issuer) {
      throw new Error('OIDC provider requires issuer URL');
    }

    const { state } = await this.createState(redirectUri, providerConfig.name);
    const codeChallenge = this.generateCodeChallenge(await this.getCodeVerifierForState(state));

    // 从 discovery endpoint 获取授权端点（也可以直接用 issuer + /oauth/authorize）
    const discovery = await this.fetchDiscovery(providerConfig.issuer);
    const authEndpoint = discovery.authorization_endpoint;

    const callbackUrl = `${new URL(redirectUri).origin}/api/oauth/callback`;

    const params = new URLSearchParams({
      client_id: providerConfig.clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: providerConfig.scopes?.join(' ') || 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    return `${authEndpoint}?${params.toString()}`;
  }

  async exchangeCode(
    providerConfig: OAuthProviderConfig,
    code: string,
    redirectUri: string,
    codeVerifier: string
  ): Promise<{ email: string; providerUserId: string }> {
    if (!providerConfig.issuer) {
      throw new Error('OIDC provider requires issuer URL');
    }

    const baseUrl = new URL(redirectUri).origin;
    const callbackUrl = `${baseUrl}/api/oauth/callback`;

    const discovery = await this.fetchDiscovery(providerConfig.issuer);
    const tokenEndpoint = discovery.token_endpoint;

    // 交换 access token
    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: providerConfig.clientId,
        client_secret: providerConfig.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        code_verifier: codeVerifier
      })
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${tokenResponse.status} ${text}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // 优先走 userinfo endpoint
    let email = '';
    let providerUserId = '';

    if (discovery.userinfo_endpoint) {
      const userResponse = await fetch(discovery.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (userResponse.ok) {
        const user = await userResponse.json();
        email = user.email;
        providerUserId = user.sub || user.id || user.user_id || '';
      }
    }

    // 若从 userinfo 拿不到，则尝试从 id_token JWT 解码
    if (!email && tokenData.id_token) {
      try {
        const payload = this.decodeJwtPayload(tokenData.id_token);
        email = payload.email;
        providerUserId = payload.sub || '';
      } catch (e) {
        console.error('Failed to decode id_token:', e);
      }
    }

    if (!email) {
      throw new Error('Failed to get email from provider');
    }

    return { email, providerUserId };
  }

  private async getCodeVerifierForState(state: string): Promise<string> {
    const row = await this.env.DB.prepare(
      'SELECT code_verifier FROM oauth_states WHERE state = ?'
    ).bind(state).first<{ code_verifier: string }>();
    return row?.code_verifier || '';
  }

  private async fetchDiscovery(issuer: string): Promise<OpenIdDiscovery> {
    const url = issuer.endsWith('/')
      ? `${issuer}.well-known/openid-configuration`
      : `${issuer}/.well-known/openid-configuration`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch OIDC discovery: ${res.status}`);
    }
    return res.json() as Promise<OpenIdDiscovery>;
  }

  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return this.base64urlEncode(array);
  }

  private generateCodeChallenge(codeVerifier: string): string {
    const data = new TextEncoder().encode(codeVerifier);
    const digest = crypto.subtle.digestSync('SHA-256', data);
    return this.base64urlEncode(new Uint8Array(digest as ArrayBuffer));
  }

  private base64urlEncode(array: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...array));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private decodeJwtPayload(token: string): Record<string, any> {
    const parts = token.split('.');
    if (parts.length < 2) throw new Error('Invalid JWT');
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json);
  }
}