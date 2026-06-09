import type { Env } from '../../types';
import { decrypt } from '../utils/crypto';

export interface OAuthProviderConfig {
  name: string;
  label: string;
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  // OpenAuth 提供商类型
  type: 'github' | 'google' | 'oidc' | 'discord' | 'facebook' | 'twitter' | 'azure-ad';
  // OIDC 发现端点
  issuer?: string;
}

// OpenAuth 提供商配置描述
export const PROVIDER_PRESETS: Record<string, { label: string; type: OAuthProviderConfig['type']; defaultScopes: string[] }> = {
  github: {
    label: 'GitHub',
    type: 'github',
    defaultScopes: ['read:user', 'user:email']
  },
  google: {
    label: 'Google',
    type: 'google',
    defaultScopes: ['openid', 'email', 'profile']
  },
  discord: {
    label: 'Discord',
    type: 'discord',
    defaultScopes: ['identify', 'email']
  },
  oidc: {
    label: '通用 OIDC',
    type: 'oidc',
    defaultScopes: ['openid', 'email', 'profile']
  }
};

export class OAuthService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async createState(redirectUri: string, provider: string): Promise<{ state: string; codeVerifier: string }> {
    const state = crypto.randomUUID();
    const codeVerifier = this.generateCodeVerifier();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await this.env.DB.prepare(
      'INSERT INTO oauth_states (id, state, user_id, redirect_uri, provider, code_verifier, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(
        crypto.randomUUID(),
        state,
        null,
        redirectUri,
        provider,
        codeVerifier,
        expiresAt,
        new Date().toISOString()
      )
      .run();

    return { state, codeVerifier };
  }

  async getState(state: string): Promise<{ redirectUri: string; provider: string; codeVerifier: string } | null> {
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
    await this.env.DB.prepare(
      'DELETE FROM oauth_states WHERE state = ?'
    ).bind(state).run();
  }

  async getAuthorizeUrl(providerConfig: OAuthProviderConfig, redirectUri: string): Promise<string> {
    const { state, codeVerifier } = await this.createState(redirectUri, providerConfig.name);

    const baseUrl = new URL(redirectUri).origin;
    const callbackUrl = `${baseUrl}/api/oauth/callback`;

    if (providerConfig.type === 'github') {
      const params = new URLSearchParams({
        client_id: providerConfig.clientId,
        redirect_uri: callbackUrl,
        state,
        scope: providerConfig.scopes?.join(' ') || 'read:user user:email',
        code_challenge_method: 'S256',
        code_challenge: this.generateCodeChallenge(codeVerifier)
      });
      return `https://github.com/login/oauth/authorize?${params.toString()}`;
    }

    if (providerConfig.type === 'google') {
      const params = new URLSearchParams({
        client_id: providerConfig.clientId,
        redirect_uri: callbackUrl,
        response_type: 'code',
        scope: providerConfig.scopes?.join(' ') || 'openid email profile',
        state,
        access_type: 'online',
        prompt: 'select_account',
        code_challenge_method: 'S256',
        code_challenge: this.generateCodeChallenge(codeVerifier)
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    if (providerConfig.type === 'discord') {
      const params = new URLSearchParams({
        client_id: providerConfig.clientId,
        redirect_uri: callbackUrl,
        response_type: 'code',
        scope: providerConfig.scopes?.join(' ') || 'identify email',
        state,
        code_challenge_method: 'S256',
        code_challenge: this.generateCodeChallenge(codeVerifier)
      });
      return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    }

    if (providerConfig.type === 'oidc' && providerConfig.issuer) {
      // 从 .well-known/openid-configuration 获取授权端点
      const wellKnown = await fetch(`${providerConfig.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
      const metadata = await wellKnown.json();
      const authEndpoint = metadata.authorization_endpoint;

      const params = new URLSearchParams({
        client_id: providerConfig.clientId,
        redirect_uri: callbackUrl,
        response_type: 'code',
        scope: providerConfig.scopes?.join(' ') || 'openid email profile',
        state,
        code_challenge_method: 'S256',
        code_challenge: this.generateCodeChallenge(codeVerifier)
      });

      return `${authEndpoint}?${params.toString()}`;
    }

    throw new Error(`Unsupported provider type: ${providerConfig.type}`);
  }

  async exchangeCode(
    providerConfig: OAuthProviderConfig,
    code: string,
    redirectUri: string,
    codeVerifier: string
  ): Promise<{ email: string; providerUserId: string }> {
    const baseUrl = new URL(redirectUri).origin;
    const callbackUrl = `${baseUrl}/api/oauth/callback`;

    let tokenEndpoint = '';
    let userInfoEndpoint = '';
    let accessToken = '';

    // 根据类型处理
    if (providerConfig.type === 'github') {
      const res = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          client_id: providerConfig.clientId,
          client_secret: providerConfig.clientSecret,
          code,
          redirect_uri: callbackUrl,
          code_verifier: codeVerifier
        })
      });
      const tokenData = await res.json();
      accessToken = tokenData.access_token;

      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      });
      const user = await userRes.json();

      // 获取邮箱（如果 user 里已经有就用）
      let email = user.email;
      if (!email) {
        const emailsRes = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
          }
        });
        const emails = await emailsRes.json();
        const primary = emails.find((e: { primary: boolean; verified: boolean; email: string }) => e.primary && e.verified);
        email = primary?.email || emails[0]?.email;
      }

      return { email, providerUserId: user.id.toString() };
    }

    if (providerConfig.type === 'google') {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: providerConfig.clientId,
          client_secret: providerConfig.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: callbackUrl,
          code_verifier: codeVerifier
        })
      });
      const tokenData = await res.json();
      accessToken = tokenData.access_token;

      const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const user = await userRes.json();

      return { email: user.email, providerUserId: user.sub };
    }

    if (providerConfig.type === 'discord') {
      const res = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: providerConfig.clientId,
          client_secret: providerConfig.clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: callbackUrl,
          code_verifier: codeVerifier
        }).toString()
      });
      const tokenData = await res.json();
      accessToken = tokenData.access_token;

      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const user = await userRes.json();

      return { email: user.email, providerUserId: user.id };
    }

    if (providerConfig.type === 'oidc' && providerConfig.issuer) {
      const wellKnown = await fetch(`${providerConfig.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
      const metadata = await wellKnown.json();
      tokenEndpoint = metadata.token_endpoint;
      userInfoEndpoint = metadata.userinfo_endpoint;

      const res = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: providerConfig.clientId,
          client_secret: providerConfig.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: callbackUrl,
          code_verifier: codeVerifier
        })
      });
      const tokenData = await res.json();
      accessToken = tokenData.access_token;

      const userRes = await fetch(userInfoEndpoint, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const user = await userRes.json();

      return { email: user.email, providerUserId: user.sub || user.id };
    }

    throw new Error(`Unsupported provider: ${providerConfig.type}`);
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
}