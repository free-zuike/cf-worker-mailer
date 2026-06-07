import type { Env } from '../../types/index';

export async function initDatabase(env: Env) {
  try {
    console.log('Initializing database...');

    // Check if users table exists
    const usersTable = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).first();

    if (!usersTable) {
      console.log('Creating database tables...');

      // Create users table
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
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `).run();

      // Create smtp_configs table
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

      // Create email_templates table
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

      // Create email_history table
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

      console.log('Database tables created successfully');
    } else {
      console.log('Database already exists, checking for type column in smtp_configs...');

      // Check if smtp_configs has type column
      const typeColumn = await env.DB.prepare(
        "PRAGMA table_info(smtp_configs)"
      ).all();

      const hasType = typeColumn.results.some(col => col.name === 'type');

      if (!hasType) {
        console.log('Adding type column to smtp_configs...');
        await env.DB.prepare(
          "ALTER TABLE smtp_configs ADD COLUMN type TEXT DEFAULT 'smtp'"
        ).run();
        console.log('Type column added successfully');
      }
    }

    console.log('Database initialization completed');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}
