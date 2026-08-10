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
      // 检查新增的表是否存在，不存在则创建
      const globalVarsTable = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='global_variables'"
      ).first();
      if (!globalVarsTable) {
        console.log('Creating global_variables table...');
        await env.DB.prepare(`
          CREATE TABLE global_variables (
            id TEXT PRIMARY KEY,
            key TEXT NOT NULL UNIQUE,
            default_value TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          )
        `).run();
      }
      // 检查 contacts 表
      const contactsTable = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='contacts'"
      ).first();
      if (!contactsTable) {
        console.log('Creating contacts table...');
        await env.DB.prepare(`
          CREATE TABLE contacts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            remark TEXT,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          )
        `).run();
      }
      // 检查 inbox_accounts 表
      const inboxAccountsTable = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='inbox_accounts'"
      ).first();
      if (!inboxAccountsTable) {
        console.log('Creating inbox_accounts table...');
        await env.DB.prepare(`
          CREATE TABLE inbox_accounts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            host TEXT NOT NULL,
            port INTEGER NOT NULL,
            username TEXT NOT NULL,
            password TEXT NOT NULL,
            use_tls INTEGER DEFAULT 1,
            sync_interval INTEGER DEFAULT 15,
            last_sync_at TEXT,
            enabled INTEGER DEFAULT 1,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          )
        `).run();
      }
      // 检查 inbox_emails 表
      const inboxEmailsTable = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='inbox_emails'"
      ).first();
      if (!inboxEmailsTable) {
        console.log('Creating inbox_emails table...');
        await env.DB.prepare(`
          CREATE TABLE inbox_emails (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            uid INTEGER NOT NULL,
            folder TEXT DEFAULT 'INBOX',
            sender TEXT,
            recipient TEXT,
            cc TEXT,
            subject TEXT,
            html TEXT,
            text TEXT,
            attachments TEXT,
            flags TEXT,
            internal_date TEXT,
            is_read INTEGER DEFAULT 0,
            starred INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            UNIQUE(account_id, uid)
          )
        `).run();
      } else {
        // 迁移：添加 folder 字段
        try {
          await env.DB.prepare("ALTER TABLE inbox_emails ADD COLUMN folder TEXT DEFAULT 'INBOX'").run();
        } catch {}
        // 迁移：添加 starred 字段
        try {
          await env.DB.prepare("ALTER TABLE inbox_emails ADD COLUMN starred INTEGER DEFAULT 0").run();
        } catch {}
      }
      // 检查 contacts 表
      const contactsTableCheck = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='contacts'"
      ).first();
      if (!contactsTableCheck) {
        console.log('Creating contacts table...');
        await env.DB.prepare(`
          CREATE TABLE contacts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            remark TEXT,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
          )
        `).run();
      }
      // 检查 api_keys 表
      const apiKeysTable = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'"
      ).first();
      if (!apiKeysTable) {
        console.log('Creating api_keys table...');
        await env.DB.prepare(`
          CREATE TABLE api_keys (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            key_hash TEXT NOT NULL,
            expires_at INTEGER,
            created_at TEXT NOT NULL
          )
        `).run();
      }
      // 迁移：为 smtp_configs 添加 IMAP 字段
      try {
        await env.DB.prepare("ALTER TABLE smtp_configs ADD COLUMN imap_host TEXT").run();
      } catch {}
      try {
        await env.DB.prepare("ALTER TABLE smtp_configs ADD COLUMN imap_port INTEGER").run();
      } catch {}
      try {
        await env.DB.prepare("ALTER TABLE smtp_configs ADD COLUMN imap_use_tls INTEGER DEFAULT 1").run();
      } catch {}
      try {
        await env.DB.prepare("ALTER TABLE smtp_configs ADD COLUMN imap_password TEXT").run();
      } catch {}
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
        imap_host TEXT, imap_port INTEGER, imap_use_tls INTEGER DEFAULT 1, imap_password TEXT,
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

    await env.DB.prepare(`
      CREATE TABLE contacts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        remark TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE inbox_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        use_tls INTEGER DEFAULT 1,
        sync_interval INTEGER DEFAULT 15,
        last_sync_at TEXT,
        enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE inbox_emails (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        uid INTEGER NOT NULL,
        folder TEXT DEFAULT 'INBOX',
        sender TEXT, recipient TEXT, cc TEXT, subject TEXT,
        html TEXT, text TEXT, attachments TEXT, flags TEXT,
        internal_date TEXT,
        is_read INTEGER DEFAULT 0,
        starred INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE(account_id, uid)
      )
    `).run();

    await env.DB.prepare(`
      CREATE TABLE api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        expires_at INTEGER,
        created_at TEXT NOT NULL
      )
    `).run();

    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}