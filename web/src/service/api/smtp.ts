import { request } from '../request';

export interface SmtpConfig {
  id: string;
  userId: string;
  name: string;
  type?: string;
  host: string;
  port: number;
  username: string;
  fromEmail: string;
  fromName?: string;
  secure: boolean;
  enabled: boolean;
  imapHost?: string;
  imapPort?: number;
  imapUseTls?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSmtpConfigParams {
  name: string;
  type?: string;
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName?: string;
  secure?: boolean;
  enabled?: boolean;
  imapHost?: string;
  imapPort?: number;
  imapUseTls?: boolean;
}

export interface UpdateSmtpConfigParams {
  name?: string;
  type?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  fromEmail?: string;
  fromName?: string;
  secure?: boolean;
  enabled?: boolean;
  imapHost?: string;
  imapPort?: number;
  imapUseTls?: boolean;
}

/** 获取 SMTP 配置列表 */
export function fetchSmtpConfigs() {
  return request<{ configs: SmtpConfig[] }>({ url: '/smtp-configs' });
}

/** 获取单个 SMTP 配置 */
export function fetchSmtpConfig(id: string) {
  return request<{ config: SmtpConfig }>({ url: `/smtp-configs/${id}` });
}

/** 创建 SMTP 配置 */
export function createSmtpConfig(data: CreateSmtpConfigParams) {
  return request<{ config: SmtpConfig }>({
    url: '/smtp-configs',
    method: 'post',
    data
  });
}

/** 更新 SMTP 配置 */
export function updateSmtpConfig(id: string, data: UpdateSmtpConfigParams) {
  return request<{ config: SmtpConfig }>({
    url: `/smtp-configs/${id}`,
    method: 'put',
    data
  });
}

/** 删除 SMTP 配置 */
export function deleteSmtpConfig(id: string) {
  return request<{ success: boolean }>({
    url: `/smtp-configs/${id}`,
    method: 'delete'
  });
}