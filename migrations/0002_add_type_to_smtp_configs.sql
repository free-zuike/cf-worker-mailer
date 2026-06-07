-- ============================================
-- 为 SMTP 配置表添加 type 字段
-- ============================================

ALTER TABLE smtp_configs ADD COLUMN type TEXT DEFAULT 'smtp';
