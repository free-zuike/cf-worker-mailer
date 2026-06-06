-- ============================================
-- 用户表
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL, -- PBKDF2 哈希值
  token TEXT, -- 访问 Token
  token_expires_at INTEGER, -- Token 过期时间 (ms)
  refresh_token TEXT, -- 刷新 Token
  refresh_token_expires_at INTEGER, -- 刷新 Token 过期时间 (ms)
  role TEXT DEFAULT 'user', -- 用户角色: user/admin
  disabled INTEGER DEFAULT 0, -- 是否禁用
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_token ON users(token);
CREATE INDEX IF NOT EXISTS idx_users_refresh_token ON users(refresh_token);

-- ============================================
-- API 密钥表
-- ============================================
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL, -- 密钥名称
  key_hash TEXT NOT NULL, -- 密钥哈希值
  scopes TEXT, -- 权限范围 JSON
  expires_at INTEGER, -- 过期时间
  last_used_at INTEGER, -- 最后使用时间
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

-- ============================================
-- SMTP 配置表
-- ============================================
CREATE TABLE IF NOT EXISTS smtp_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL, -- 配置名称
  host TEXT NOT NULL, -- SMTP 服务器地址
  port INTEGER NOT NULL, -- SMTP 端口
  username TEXT NOT NULL, -- 用户名
  password TEXT NOT NULL, -- 密码（加密存储）
  from_email TEXT NOT NULL, -- 发件人邮箱
  from_name TEXT, -- 发件人名称
  secure INTEGER DEFAULT 1, -- 是否使用 TLS/SSL
  enabled INTEGER DEFAULT 1, -- 是否启用
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_smtp_configs_user_id ON smtp_configs(user_id);

-- ============================================
-- 邮件模板表
-- ============================================
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL, -- 模板名称
  subject TEXT NOT NULL, -- 邮件主题
  html_content TEXT, -- HTML 内容
  text_content TEXT, -- 纯文本内容
  variables TEXT, -- 变量定义 JSON
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON email_templates(user_id);

-- ============================================
-- 邮件发送历史表
-- ============================================
CREATE TABLE IF NOT EXISTS email_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  config_id TEXT, -- 使用的 SMTP 配置 ID
  template_id TEXT, -- 使用的模板 ID
  from_email TEXT NOT NULL, -- 发件人
  to_emails TEXT NOT NULL, -- 收件人列表 JSON
  cc_emails TEXT, -- 抄送人列表 JSON
  bcc_emails TEXT, -- 密送人列表 JSON
  subject TEXT NOT NULL, -- 主题
  html_content TEXT, -- HTML 内容
  text_content TEXT, -- 纯文本内容
  attachments TEXT, -- 附件信息 JSON
  status TEXT NOT NULL, -- 状态: pending/sent/failed
  error_message TEXT, -- 错误信息
  sent_at TEXT, -- 发送时间
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_history_user_id ON email_history(user_id);
CREATE INDEX IF NOT EXISTS idx_email_history_status ON email_history(status);
CREATE INDEX IF NOT EXISTS idx_email_history_created_at ON email_history(created_at);

-- ============================================
-- 域名验证表
-- ============================================
CREATE TABLE IF NOT EXISTS domain_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  domain TEXT NOT NULL, -- 域名
  verification_code TEXT NOT NULL, -- 验证代码
  verified INTEGER DEFAULT 0, -- 是否验证通过
  verified_at TEXT, -- 验证时间
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_domain_verifications_user_id ON domain_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_domain_verifications_domain ON domain_verifications(domain);

-- ============================================
-- 审计日志表
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  data TEXT, -- JSON
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
