import type { Env } from '../../types';

export async function initDatabase(env: Env) {
  try {
    // 检查 users 表是否存在
    const usersTable = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).first();

    if (!usersTable) {
      console.log('Creating database tables...');

      // 用户表
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          token TEXT,
          token_expires_at INTEGER,
          refresh_token TEXT,
          refresh_token_expires_at INTEGER,
          role TEXT DEFAULT 'user',
          disabled INTEGER DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `).run();

      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)').run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_token ON users(token)').run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_users_refresh_token ON users(refresh_token)').run();

      // SMTP 配置表
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS smtp_configs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          host TEXT NOT NULL,
          port INTEGER NOT NULL,
          username TEXT NOT NULL,
          password TEXT NOT NULL,
          from_email TEXT NOT NULL,
          from_name TEXT,
          secure INTEGER DEFAULT 1,
          enabled INTEGER DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `).run();

      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_smtp_configs_user_id ON smtp_configs(user_id)').run();

      // 邮件模板表
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS email_templates (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          subject TEXT NOT NULL,
          html_content TEXT,
          text_content TEXT,
          variables TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `).run();

      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON email_templates(user_id)').run();

      // 邮件发送历史表
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS email_history (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          config_id TEXT,
          template_id TEXT,
          from_email TEXT NOT NULL,
          to_emails TEXT NOT NULL,
          cc_emails TEXT,
          bcc_emails TEXT,
          subject TEXT NOT NULL,
          html_content TEXT,
          text_content TEXT,
          attachments TEXT,
          status TEXT NOT NULL,
          error_message TEXT,
          sent_at TEXT,
          created_at TEXT NOT NULL
        )
      `).run();

      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_email_history_user_id ON email_history(user_id)').run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_email_history_status ON email_history(status)').run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_email_history_created_at ON email_history(created_at)').run();

      console.log('Database tables created successfully');
    } else {
      console.log('Database already exists');
    }
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}
