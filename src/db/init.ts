import type { Env } from '../../types/index';

export async function initDatabase(env: Env) {
  try {
    console.log('Initializing database...');

    const usersTable = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).first();

    if (!usersTable) {
      console.log('Creating database tables...');

      await env.DB.prepare(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          token TEXT,
          token_expires_at INTEGER,
          refresh_token TEXT,
          refresh_token_expires_at INTEGER,
          role TEXT DEFAULT 'user',
          disabled INTEGER DEFAULT 0,
          oauth_provider TEXT,
          oauth_provider_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `).run();

      await env.DB.prepare(`
        CREATE TABLE smtp_configs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT DEFAULT 'smtp',
          host TEXT,
          port INTEGER,
          username TEXT,
          password TEXT,
          from_email TEXT NOT NULL,
          from_name TEXT,
          secure INTEGER DEFAULT 1,
          enabled INTEGER DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `).run();

      await env.DB.prepare(`
        CREATE TABLE email_templates (
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

      await env.DB.prepare(`
        CREATE TABLE email_history (
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

      await env.DB.prepare(`
        CREATE TABLE oauth_states (
          id TEXT PRIMARY KEY,
          state TEXT NOT NULL UNIQUE,
          user_id TEXT,
          redirect_uri TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at TEXT NOT NULL
        )
      `).run();

      await env.DB.prepare(`
        CREATE TABLE user_settings (
          user_id TEXT PRIMARY KEY,
          settings TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `).run();

      console.log('Database tables created successfully');
    } else {
      console.log('Database already exists, checking for missing columns...');

      const smtpColumns = await env.DB.prepare(
        "PRAGMA table_info(smtp_configs)"
      ).all();
      const hasType = smtpColumns.results.some(col => col.name === 'type');
      if (!hasType) {
        console.log('Adding type column to smtp_configs...');
        await env.DB.prepare(
          "ALTER TABLE smtp_configs ADD COLUMN type TEXT DEFAULT 'smtp'"
        ).run();
        console.log('Type column added successfully');
      }

      const userColumns = await env.DB.prepare(
        "PRAGMA table_info(users)"
      ).all();
      const hasOauthProvider = userColumns.results.some(col => col.name === 'oauth_provider');
      const hasOauthProviderId = userColumns.results.some(col => col.name === 'oauth_provider_id');
      
      if (!hasOauthProvider) {
        console.log('Adding oauth_provider column to users...');
        await env.DB.prepare(
          "ALTER TABLE users ADD COLUMN oauth_provider TEXT"
        ).run();
      }
      if (!hasOauthProviderId) {
        console.log('Adding oauth_provider_id column to users...');
        await env.DB.prepare(
          "ALTER TABLE users ADD COLUMN oauth_provider_id TEXT"
        ).run();
      }
    }

    // 检查 oauth_states 表
    const oauthStatesTable = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='oauth_states'"
    ).first();
    if (!oauthStatesTable) {
      console.log('Creating oauth_states table...');
      await env.DB.prepare(`
        CREATE TABLE oauth_states (
          id TEXT PRIMARY KEY,
          state TEXT NOT NULL UNIQUE,
          user_id TEXT,
          redirect_uri TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at TEXT NOT NULL
        )
      `).run();
      console.log('oauth_states table created successfully');
    }

    // 检查 user_settings 表
    const userSettingsTable = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='user_settings'"
    ).first();
    if (!userSettingsTable) {
      console.log('Creating user_settings table...');
      await env.DB.prepare(`
        CREATE TABLE user_settings (
          user_id TEXT PRIMARY KEY,
          settings TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `).run();
      console.log('user_settings table created successfully');
    }

    console.log('Database initialization completed');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}