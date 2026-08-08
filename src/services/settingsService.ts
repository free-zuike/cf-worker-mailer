import type { Env } from '../../types';
import { encrypt, decrypt, requireEncryptionKey } from '../utils/crypto';
import type { SystemSettings, CaptchaSettings, OAuthSettings, OAuthProviderConfig } from '../../types';

// 系统设置的固�?key
const SYSTEM_SETTINGS_KEY = 'system';

// 默认人机验证设置
const defaultCaptcha: CaptchaSettings = {
  enabled: false,
  siteKey: '',
  secretKey: ''
};

// 默认 OAuth 设置
const defaultOAuth: OAuthSettings = {
  enabled: false,
  providers: [
    {
      name: 'openauth',
      label: 'OpenAuth',
      enabled: false,
      clientId: '',
      clientSecret: '',
      scopes: ['openid', 'email', 'profile'],
      issuer: ''
    }
  ]
};

export class SettingsService {
  private env: Env;
  private _encryptionKey: string | null = null;

  constructor(env: Env) {
    this.env = env;
  }

  private getEncryptionKey(): string {
    if (!this._encryptionKey) {
      this._encryptionKey = requireEncryptionKey(this.env);
    }
    return this._encryptionKey;
  }

  // 获取完整系统设置
  async getSettings(): Promise<SystemSettings> {
    try {
      const row = await this.env.DB.prepare(
        'SELECT settings FROM system_settings WHERE settings_key = ?'
      ).bind(SYSTEM_SETTINGS_KEY).first<{ settings: string }>();

      if (row) {
        const parsed = JSON.parse(row.settings);
        return {
          captcha: { ...defaultCaptcha, ...parsed.captcha },
          oauth: this.mergeOAuth(parsed.oauth)
        };
      }
    } catch (e) {
      console.warn('Failed to load settings, using defaults', e);
    }
    return { captcha: defaultCaptcha, oauth: defaultOAuth };
  }

  // 获取解密后的系统设置（管理员专用�?
  async getDecryptedSettings(): Promise<SystemSettings> {
    const settings = await this.getSettings();
    // 解密密钥
    if (settings.captcha.secretKey) {
      try {
        settings.captcha.secretKey = await decrypt(settings.captcha.secretKey, this.getEncryptionKey());
      } catch {
        // 可能已经是明�?
      }
    }
    // 解密每个 provider 的密�?
    for (const p of settings.oauth.providers) {
      if (p.clientSecret) {
        try {
          p.clientSecret = await decrypt(p.clientSecret, this.getEncryptionKey());
        } catch {
          // 可能已经是明�?
        }
      }
    }
    return settings;
  }

  // 保存人机验证设置（允许空值）
  async saveCaptchaSettings(captcha: CaptchaSettings): Promise<CaptchaSettings> {
    const current = await this.getSettings();
    const toSave: CaptchaSettings = {
      enabled: captcha.enabled ?? false,
      siteKey: captcha.siteKey ?? '',
      // 密钥入数据库时加�?
      secretKey: captcha.secretKey ? await encrypt(captcha.secretKey, this.getEncryptionKey()) : ''
    };
    const updated: SystemSettings = {
      captcha: toSave,
      oauth: current.oauth
    };
    await this.saveInternal(updated);
    return { ...toSave, secretKey: captcha.secretKey ?? '' };
  }

  // 保存 OAuth 设置（允许空值）
  async saveOAuthSettings(oauth: OAuthSettings): Promise<OAuthSettings> {
    const current = await this.getSettings();
    const providers: OAuthProviderConfig[] = await Promise.all(
      (oauth.providers ?? []).map(async p => ({
        name: p.name || 'openauth',
        label: p.label || 'OpenAuth',
        enabled: p.enabled ?? false,
        clientId: p.clientId ?? '',
        clientSecret: p.clientSecret ? await encrypt(p.clientSecret, this.getEncryptionKey()) : '',
        scopes: p.scopes?.length ? p.scopes : ['openid', 'email', 'profile'],
        issuer: p.issuer ?? ''
      }))
    );
    const toSave: OAuthSettings = {
      enabled: oauth.enabled ?? false,
      providers
    };
    const updated: SystemSettings = {
      captcha: current.captcha,
      oauth: toSave
    };
    await this.saveInternal(updated);
    return { ...toSave, providers: providers.map(p => ({ ...p, clientSecret: oauth.providers?.find(op => op.name === p.name)?.clientSecret ?? '' })) };
  }

  private async saveInternal(settings: SystemSettings) {
    const now = new Date().toISOString();
    const json = JSON.stringify(settings);
    const existing = await this.env.DB.prepare(
      'SELECT 1 FROM system_settings WHERE settings_key = ?'
    ).bind(SYSTEM_SETTINGS_KEY).first();
    if (existing) {
      await this.env.DB.prepare(
        'UPDATE system_settings SET settings = ?, updated_at = ? WHERE settings_key = ?'
      ).bind(json, now, SYSTEM_SETTINGS_KEY).run();
    } else {
      await this.env.DB.prepare(
        'INSERT INTO system_settings (settings_key, settings, created_at, updated_at) VALUES (?, ?, ?, ?)'
      ).bind(SYSTEM_SETTINGS_KEY, json, now, now).run();
    }
  }

  private mergeOAuth(oauth: OAuthSettings | undefined): OAuthSettings {
    if (!oauth) return defaultOAuth;
    return {
      enabled: oauth.enabled ?? false,
      providers: (oauth.providers ?? []).length > 0
        ? oauth.providers.map(p => ({
            name: p.name || 'openauth',
            label: p.label || 'OpenAuth',
            enabled: !!p.enabled,
            clientId: p.clientId || '',
            clientSecret: p.clientSecret || '',
            scopes: p.scopes?.length ? p.scopes : ['openid', 'email', 'profile'],
            issuer: p.issuer || ''
          }))
        : defaultOAuth.providers
    };
  }
}
