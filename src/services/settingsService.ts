import type { Env } from '../../types';
import { encrypt, decrypt } from '../utils/crypto';

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

export interface Settings {
  oauthEnabled: boolean;
  oauthProviders: OAuthProviderConfig[];
  captchaEnabled: boolean;
  captchaProvider: 'turnstile';
  captchaSiteKey: string;
  captchaSecretKey: string;
  theme: 'light' | 'dark';
  updatedAt: string;
}

// 系统级默认值
export const defaultSettings: Settings = {
  oauthEnabled: false,
  oauthProviders: [
    {
      name: 'openauth',
      label: 'OpenAuth',
      enabled: false,
      clientId: '',
      clientSecret: '',
      type: 'oidc',
      scopes: ['openid', 'email', 'profile'],
      issuer: ''
    }
  ],
  captchaEnabled: false,
  captchaProvider: 'turnstile',
  captchaSiteKey: '',
  captchaSecretKey: '',
  theme: 'light',
  updatedAt: new Date().toISOString()
};

// settings key 固定为 `system`，代表全局系统设置
const SYSTEM_SETTINGS_KEY = 'system';

export class SettingsService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async getSettings(): Promise<Settings> {
    try {
      const row = await this.env.DB.prepare(
        'SELECT settings FROM system_settings WHERE settings_key = ?'
      ).bind(SYSTEM_SETTINGS_KEY).first<{ settings: string }>();

      if (row) {
        const parsed = JSON.parse(row.settings) as Settings;
        return this.mergeDefaults(parsed);
      }
    } catch (e) {
      console.warn('Failed to load settings, using defaults', e);
    }
    return { ...defaultSettings };
  }

  async saveSettings(settings: Settings, isAdmin: boolean): Promise<Settings> {
    if (!isAdmin) {
      throw new Error('Only administrators can modify system settings');
    }

    // 加密敏感字段
    const providers = settings.oauthProviders.map(p => ({
      ...p,
      clientSecret: p.clientSecret ? encrypt(p.clientSecret) : ''
    }));

    const toSave: Settings = {
      ...settings,
      oauthProviders: providers,
      captchaSecretKey: settings.captchaSecretKey
        ? encrypt(settings.captchaSecretKey)
        : '',
      updatedAt: new Date().toISOString()
    };

    const now = new Date().toISOString();
    const json = JSON.stringify(toSave);

    // UPSERT：先尝试更新，若不存在则插入
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

    return this.getDecryptedSettings();
  }

  async getDecryptedSettings(): Promise<Settings> {
    try {
      const row = await this.env.DB.prepare(
        'SELECT settings FROM system_settings WHERE settings_key = ?'
      ).bind(SYSTEM_SETTINGS_KEY).first<{ settings: string }>();

      if (row) {
        const parsed = JSON.parse(row.settings) as Settings;
        const merged = this.mergeDefaults(parsed);

        const providers = await Promise.all(
          merged.oauthProviders.map(async p => ({
            ...p,
            clientSecret: p.clientSecret ? decrypt(p.clientSecret) : ''
          }))
        );

        return {
          ...merged,
          oauthProviders: providers,
          captchaSecretKey: merged.captchaSecretKey ? decrypt(merged.captchaSecretKey) : ''
        };
      }
    } catch (e) {
      console.warn('Failed to decrypt settings', e);
    }
    return { ...defaultSettings };
  }

  // 把旧设置和新字段做合并（向后兼容）
  private mergeDefaults(parsed: Settings): Settings {
    const providers = parsed.oauthProviders?.length > 0
      ? parsed.oauthProviders.map(p => ({
          name: p.name || 'openauth',
          label: p.label || 'OpenAuth',
          enabled: !!p.enabled,
          clientId: p.clientId || '',
          clientSecret: p.clientSecret || '',
          scopes: p.scopes?.length ? p.scopes : ['openid', 'email', 'profile'],
          type: (p.type as 'oidc') || 'oidc',
          issuer: p.issuer || ''
        }))
      : defaultSettings.oauthProviders;

    return {
      ...defaultSettings,
      ...parsed,
      captchaProvider: parsed.captchaProvider || 'turnstile',
      theme: parsed.theme || 'light',
      oauthProviders: providers
    };
  }
}