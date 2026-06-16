-- 添加 API Key 哈希列到用户表
ALTER TABLE users ADD COLUMN api_key_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_users_api_key_hash ON users(api_key_hash);
