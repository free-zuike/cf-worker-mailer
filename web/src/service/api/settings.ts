import { request } from '../request';

export interface CaptchaSettings {
  enabled: boolean;
  siteKey: string;
  secretKey: string;
}

export interface OAuthProvider {
  name: string;
  label: string;
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  scopes: string[];
}

export interface SystemSettings {
  captcha: CaptchaSettings;
  oauth: {
    enabled: boolean;
    providers: OAuthProvider[];
  };
}

export interface PublicSettings {
  githubOAuthEnabled: boolean;
  captchaEnabled: boolean;
  captchaSiteKey: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark';
}

/** 获取公开设置 */
export function fetchPublicSettings() {
  return request<PublicSettings>({ url: '/settings/public' });
}

/** 获取系统设置（管理员） */
export function fetchSettings() {
  return request<{ settings: SystemSettings }>({ url: '/settings' });
}

/** 保存人机验证设置 */
export function saveCaptchaSettings(captcha: CaptchaSettings) {
  return request<{ captcha: CaptchaSettings }>({
    url: '/settings/captcha',
    method: 'put',
    data: { captcha }
  });
}

/** 保存 GitHub OAuth 设置 */
export function saveGithubOAuthSettings(data: {
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
  label?: string;
}) {
  return request<{ oauth: { enabled: boolean; providers: OAuthProvider[] } }>({
    url: '/settings/github',
    method: 'put',
    data
  });
}

/** 获取用户偏好 */
export function fetchPreferences() {
  return request<{ preferences: UserPreferences }>({ url: '/user/preferences' });
}

/** 保存用户偏好 */
export function savePreferences(preferences: Partial<UserPreferences>) {
  return request<{ preferences: UserPreferences }>({
    url: '/user/preferences',
    method: 'put',
    data: { preferences }
  });
}