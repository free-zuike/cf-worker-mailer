// ============================================
// 共享类型定义 - 前后端通用
// ============================================

// ==================== 用户相关类型 ====================
export interface User {
  id: string;
  email: string;
  role: 'user' | 'admin';
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserToken {
  token: string;
  refreshToken: string;
  expiresAt: number;
}

// ==================== SMTP 配置相关类型 ====================
export interface SmtpConfig {
  id: string;
  userId: string;
  name: string;
  host: string;
  port: number;
  username: string;
  fromEmail: string;
  fromName?: string;
  secure: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSmtpConfigRequest {
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName?: string;
  secure?: boolean;
  enabled?: boolean;
}

export interface UpdateSmtpConfigRequest {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  fromEmail?: string;
  fromName?: string;
  secure?: boolean;
  enabled?: boolean;
}

// ==================== 邮件模板相关类型 ====================
export interface EmailTemplate {
  id: string;
  userId: string;
  name: string;
  subject: string;
  htmlContent?: string;
  textContent?: string;
  variables?: TemplateVariable[];
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVariable {
  key: string;
  defaultValue: string;
  description?: string;
}

export interface CreateEmailTemplateRequest {
  name: string;
  subject: string;
  htmlContent?: string;
  textContent?: string;
  variables?: TemplateVariable[];
}

export interface UpdateEmailTemplateRequest {
  name?: string;
  subject?: string;
  htmlContent?: string;
  textContent?: string;
  variables?: TemplateVariable[];
}

// ==================== 邮件发送相关类型 ====================
export interface EmailRequest {
  from?: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  templateVariables?: Record<string, string>;
  attachments?: Attachment[];
  configId?: string;
  async?: boolean;
}

export interface Attachment {
  filename: string;
  content: string;
  contentType?: string;
}

export interface EmailResponse {
  id: string;
  status: 'pending' | 'sent' | 'failed';
  createdAt: string;
}

export interface EmailHistory {
  id: string;
  userId: string;
  configId?: string;
  templateId?: string;
  fromEmail: string;
  toEmails: string[];
  ccEmails?: string[];
  bccEmails?: string[];
  subject: string;
  htmlContent?: string;
  textContent?: string;
  attachments?: Attachment[];
  status: 'pending' | 'sent' | 'failed';
  errorMessage?: string;
  sentAt?: string;
  createdAt: string;
}

// ==================== 统计相关类型 ====================
export interface EmailMetrics {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  byDay: Record<string, { total: number; sent: number; failed: number }>;
}

// ==================== 后台设置相关类型 ====================
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

// ==================== 环境类型 ====================
export interface Env {
  DB: D1Database;
  EMAIL_QUEUE: Queue;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  ADMIN_PASSWORD?: string;
  ADMIN_EMAIL?: string;
  ALLOWED_ORIGINS?: string;
}