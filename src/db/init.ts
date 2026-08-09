import type { Env } from '../../types/index';

/**
 * 数据库初始化（首次运行时建表）。
 * 增量迁移请使用 `wrangler d1 migrations apply` 执行 SQL 迁移文件。
 */
export async function initDatabase(env: Env) {
  try {
    const usersTable = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).first();

    if (usersTable) {
      return;
    }

    console.log('Creating database tables...');

    await env.DB.prepare(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        token TEXT, token_expires_at INTEGER,
        refresh_token TEXT, refresh_token_expires_at INTEGER,
        role TEXT DEFAULT 'user',
        github_id TEXT, name TEXT, avatar_url TEXT,
        api_key_hash TEXT,
        disabled INTEGER DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE smtp_configs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL, type TEXT DEFAULT 'smtp',
        host TEXT, port INTEGER, username TEXT, password TEXT,
        from_email TEXT NOT NULL, from_name TEXT,
        secure INTEGER DEFAULT 1, enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE email_templates (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        name TEXT NOT NULL, subject TEXT NOT NULL,
        html_content TEXT, text_content TEXT, variables TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE email_history (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        config_id TEXT, template_id TEXT,
        from_email TEXT NOT NULL,
        to_emails TEXT NOT NULL, cc_emails TEXT, bcc_emails TEXT,
        subject TEXT NOT NULL,
        html_content TEXT, text_content TEXT, attachments TEXT,
        status TEXT NOT NULL, error_message TEXT, sent_at TEXT,
        created_at TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE oauth_states (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL UNIQUE, user_id TEXT,
        redirect_uri TEXT, provider TEXT NOT NULL,
        code_verifier TEXT, expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE system_settings (
        settings_key TEXT PRIMARY KEY,
        settings TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE user_preferences (
        user_id TEXT PRIMARY KEY,
        preferences TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE global_variables (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        default_value TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    `).run();

    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}