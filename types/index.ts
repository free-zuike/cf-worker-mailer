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
  type?: string;
  host: string;
  port: number;
  username: string;
  fromEmail: string;
  fromName?: string;
  secure: boolean;
  enabled: boolean;
  /** IMAP 收件服务器（可选，填了则支持收件） */
  imapHost?: string;
  imapPort?: number;
  imapUseTls?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSmtpConfigRequest {
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
  imapPassword?: string;
}

export interface UpdateSmtpConfigRequest {
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
  imapPassword?: string;
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
  content: string; // base64 编码
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

// ==================== OAuth 提供商配置 ====================
export interface OAuthProviderConfig {
  name: string;
  label: string;
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  issuer?: string;
}

// ==================== 全局系统设置（管理员修改） ====================
export interface CaptchaSettings {
  enabled: boolean;
  siteKey: string;
  secretKey: string;
}

export interface OAuthSettings {
  enabled: boolean;
  providers: OAuthProviderConfig[];
}

export interface SystemSettings {
  captcha: CaptchaSettings;
  oauth: OAuthSettings;
}

// ==================== 用户偏好（每个用户自己改） ====================
export interface UserPreferences {
  theme: 'light' | 'dark';
}

// ==================== 收件箱相关类型 ====================
export interface InboxAccount {
  id: string;
  userId: string;
  name: string;
  host: string;
  port: number;
  username: string;
  useTls: boolean;
  syncInterval: number; // 同步间隔（分钟），默认 15
  lastSyncAt?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInboxAccountRequest {
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  useTls?: boolean;
  syncInterval?: number;
}

export interface UpdateInboxAccountRequest {
  name?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  useTls?: boolean;
  syncInterval?: number;
  enabled?: boolean;
}

export interface InboxEmail {
  id: string;
  accountId: string;
  userId: string;
  uid: number;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: string; // JSON
  flags?: string; // JSON
  internalDate: string;
  isRead: boolean;
  createdAt: string;
}

// ==================== 环境类型 ====================
export interface Env {
  DB: D1Database;
  MAIL_QUEUE: Queue;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  /** R2 存储桶，用于图片/文件上传 */
  R2_UPLOAD_BUCKET: R2Bucket;
  ADMIN_PASSWORD?: string;
  ADMIN_EMAIL?: string;
  ALLOWED_ORIGINS?: string;
  /** AES-GCM 加密密钥，用于 SMTP 密码和 OAuth/Captcha 密钥的加密存储（必填） */
  ENCRYPTION_KEY?: string;
}
