import type { Env } from '../../types';
import { encrypt, decrypt } from '../utils/crypto';

export interface Settings {
  oauthEnabled: boolean;
  oauthProviders: OAuthProviderConfig[];
  captchaEnabled: boolean;
  captchaProvider: 'turnstile' | 'recaptcha';
  captchaSiteKey?: string;
  captchaSecretKey?: string;
  theme: 'light' | 'dark';
  updatedAt: string;
}

export interface OAuthProviderConfig {
  name: string;
  label: string;
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
}

export const defaultSettings: Settings = {
  oauthEnabled: false,
  oauthProviders: [
    {
      name: 'github',
      label: 'GitHub',
      enabled: false,
      clientId: '',
      clientSecret: '',
      scopes: ['read:user', 'user:email']
    },
    {
      name: 'google',
      label: 'Google',
      enabled: false,
      clientId: '',
      clientSecret: '',
      scopes: ['openid', 'email', 'profile']
    }
  ],
  captchaEnabled: false,
  captchaProvider: 'turnstile',
  captchaSiteKey: '',
  captchaSecretKey: '',
  theme: 'light',
  updatedAt: new Date().toISOString()
};

export class SettingsService {
  private env: Env;
  private userId: string;

  constructor(env: Env, userId: string) {
    this.env = env;
    this.userId = userId;
  }

  async getSettings(): Promise<Settings> {
    try {
      const row = await this.env.DB.prepare(
        'SELECT settings FROM user_settings WHERE user_id = ?'
      ).bind(this.userId).first<{ settings: string }>();

      if (row) {
        const parsed = JSON.parse(row.settings) as Settings;
        return {
          ...defaultSettings,
          ...parsed,
          oauthProviders: defaultSettings.oauthProviders.map(defaultProvider => ({
            ...defaultProvider,
            ...parsed.oauthProviders?.find((pp: OAuthProviderConfig) => pp.name === defaultProvider.name)
          }))
        };
      }

      return { ...defaultSettings };
    } catch (e) {
      return { ...defaultSettings };
    }
  }

  async saveSettings(settings: Settings): Promise<void> {
    const now = new Date().toISOString();
    settings.updatedAt = now;

    // 获取现有设置（用于保留已有加密的 secret）
    const existing = await this.getSettings();

    // 判断一个字符串是否看起来是已加密的（base64 或特定格式）
    const looksEncrypted = (val: string): boolean => {
      return !!val && (val.includes('::') || val.startsWith('eyJ') || (val.length > 30 && /^[A-Za-z0-9+/=]+$/.test(val)));
    };

    // 处理 OAuth providers
    const processedProviders = await Promise.all(
      settings.oauthProviders.map(async (provider) => {
        const existingProvider = existing.oauthProviders?.find(p => p.name === provider.name);
        
        let secret = provider.clientSecret;
        
        if (!secret || secret.trim() === '') {
          // 用户未输入新 secret，保留原有值
          secret = existingProvider?.clientSecret || '';
        } else if (!looksEncrypted(secret)) {
          // 用户输入了新的明文 secret，加密它
          secret = await encrypt(secret);
        }
        // 否则 secret 已经是加密的（从前端直接传回来的旧值）
        
        return {
          ...provider,
          clientSecret: secret
        };
      })
    );

    // 处理 captchaSecretKey
    let captchaSecret = settings.captchaSecretKey || '';
    if (!captchaSecret) {
      captchaSecret = existing.captchaSecretKey || '';
    } else if (!looksEncrypted(captchaSecret)) {
      captchaSecret = await encrypt(captchaSecret);
    }

    const settingsToSave = {
      ...settings,
      oauthProviders: processedProviders,
      captchaSecretKey: captchaSecret
    };

    await this.env.DB.prepare(
      'INSERT INTO user_settings (user_id, settings, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET settings = ?, updated_at = ?'
    )
      .bind(
        this.userId,
        JSON.stringify(settingsToSave),
        now,
        now,
        JSON.stringify(settingsToSave),
        now
      )
      .run();
  }

  async getDecryptedSettings(): Promise<Settings> {
    const settings = await this.getSettings();
    const decryptedProviders = await Promise.all(
      settings.oauthProviders.map(async (provider) => ({
        ...provider,
        clientSecret: provider.clientSecret
          ? await decrypt(provider.clientSecret)
          : ''
      }))
    );

    return {
      ...settings,
      oauthProviders: decryptedProviders,
      captchaSecretKey: settings.captchaSecretKey
        ? await decrypt(settings.captchaSecretKey)
        : ''
    };
  }
}