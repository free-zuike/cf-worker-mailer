import type { Env, User, UserToken } from '../../types';
import { hashPassword, verifyPassword, generateToken, createApiKeyToken } from '../utils/password';

export class UserService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async register(email: string, password: string): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new Error('User already exists');
    }

    const id = crypto.randomUUID();
    const hashedPassword = await hashPassword(password);
    const now = new Date().toISOString();
    const isAdmin = email === this.env.ADMIN_EMAIL;

    await this.env.DB.prepare(
      'INSERT INTO users (id, email, password, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
      .bind(id, email, hashedPassword, isAdmin ? 'admin' : 'user', now, now)
      .run();

    return this.findById(id) as Promise<User>;
  }

  async login(email: string, password: string): Promise<{ user: User; token: UserToken }> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const userRow = await this.env.DB.prepare(
      'SELECT password, disabled FROM users WHERE id = ?'
    ).bind(user.id).first<{ password: string; disabled: number }>();

    if (!userRow || userRow.disabled) {
      throw new Error('Account disabled');
    }

    const passwordValid = await verifyPassword(password, userRow.password);
    if (!passwordValid) {
      throw new Error('Invalid credentials');
    }

    const token = generateToken();
    const refreshToken = generateToken();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    const refreshExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    await this.env.DB.prepare(
      'UPDATE users SET token = ?, token_expires_at = ?, refresh_token = ?, refresh_token_expires_at = ?, updated_at = ? WHERE id = ?'
    )
      .bind(token, expiresAt, refreshToken, refreshExpiresAt, new Date().toISOString(), user.id)
      .run();

    return {
      user,
      token: { token, refreshToken, expiresAt }
    };
  }

  async createToken(user: User): Promise<{ token: UserToken }> {
    const token = generateToken();
    const refreshToken = generateToken();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    const refreshExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    await this.env.DB.prepare(
      'UPDATE users SET token = ?, token_expires_at = ?, refresh_token = ?, refresh_token_expires_at = ?, updated_at = ? WHERE id = ?'
    )
      .bind(token, expiresAt, refreshToken, refreshExpiresAt, new Date().toISOString(), user.id)
      .run();

    return {
      token: { token, refreshToken, expiresAt }
    };
  }

  async refreshToken(refreshToken: string): Promise<{ user: User; token: UserToken }> {
    const userRow = await this.env.DB.prepare(
      'SELECT id, email, role, disabled, refresh_token_expires_at FROM users WHERE refresh_token = ?'
    ).bind(refreshToken).first<{
      id: string;
      email: string;
      role: string;
      disabled: number;
      refresh_token_expires_at: number;
    }>();

    if (!userRow || userRow.disabled || userRow.refresh_token_expires_at < Date.now()) {
      throw new Error('Invalid refresh token');
    }

    const user = await this.findById(userRow.id);
    if (!user) {
      throw new Error('User not found');
    }

    const newToken = generateToken();
    const newRefreshToken = generateToken();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    const refreshExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

    await this.env.DB.prepare(
      'UPDATE users SET token = ?, token_expires_at = ?, refresh_token = ?, refresh_token_expires_at = ?, updated_at = ? WHERE id = ?'
    )
      .bind(newToken, expiresAt, newRefreshToken, refreshExpiresAt, new Date().toISOString(), user.id)
      .run();

    return {
      user,
      token: { token: newToken, refreshToken: newRefreshToken, expiresAt }
    };
  }

  async findByToken(token: string): Promise<User | null> {
    const row = await this.env.DB.prepare(
      'SELECT id, email, role, disabled, token_expires_at FROM users WHERE token = ?'
    ).bind(token).first<{
      id: string;
      email: string;
      role: string;
      disabled: number;
      token_expires_at: number;
    }>();

    if (!row || row.disabled || row.token_expires_at < Date.now()) {
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      role: row.role as 'user' | 'admin',
      disabled: !!row.disabled,
      createdAt: '',
      updatedAt: ''
    };
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.env.DB.prepare(
      'SELECT id, email, role, disabled, created_at, updated_at FROM users WHERE email = ?'
    ).bind(email).first<{
      id: string;
      email: string;
      role: string;
      disabled: number;
      created_at: string;
      updated_at: string;
    }>();

    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      role: row.role as 'user' | 'admin',
      disabled: !!row.disabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.env.DB.prepare(
      'SELECT id, email, role, disabled, created_at, updated_at FROM users WHERE id = ?'
    ).bind(id).first<{
      id: string;
      email: string;
      role: string;
      disabled: number;
      created_at: string;
      updated_at: string;
    }>();

    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      role: row.role as 'user' | 'admin',
      disabled: !!row.disabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async listUsers(): Promise<User[]> {
    const { results } = await this.env.DB.prepare(
      'SELECT id, email, role, disabled, created_at, updated_at FROM users ORDER BY created_at DESC'
    ).all<{
      id: string;
      email: string;
      role: string;
      disabled: number;
      created_at: string;
      updated_at: string;
    }>();

    return results.map(row => ({
      id: row.id,
      email: row.email,
      role: row.role as 'user' | 'admin',
      disabled: !!row.disabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async updateUser(id: string, updates: { role?: string; disabled?: boolean }): Promise<User> {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.role !== undefined) {
      fields.push('role = ?');
      values.push(updates.role);
    }
    if (updates.disabled !== undefined) {
      fields.push('disabled = ?');
      values.push(updates.disabled ? 1 : 0);
    }
    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await this.env.DB.prepare(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values).run();

    return this.findById(id) as Promise<User>;
  }

  // 通过 GitHub ID 查找用户
  async findByGithubId(githubId: string): Promise<User | null> {
    const row = await this.env.DB.prepare(
      'SELECT id, email, role, disabled, created_at, updated_at FROM users WHERE github_id = ?'
    ).bind(githubId).first<{
      id: string;
      email: string;
      role: string;
      disabled: number;
      created_at: string;
      updated_at: string;
    }>();

    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      role: row.role as 'user' | 'admin',
      disabled: !!row.disabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // 使用 GitHub 注册用户
  async registerWithGithub(
    email: string,
    password: string,
    githubId: string,
    name?: string,
    avatarUrl?: string
  ): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new Error('User already exists');
    }

    const id = crypto.randomUUID();
    const hashedPassword = await hashPassword(password);
    const now = new Date().toISOString();
    const isAdmin = email === this.env.ADMIN_EMAIL;

    await this.env.DB.prepare(
      'INSERT INTO users (id, email, password, role, github_id, name, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(id, email, hashedPassword, isAdmin ? 'admin' : 'user', githubId, name || null, avatarUrl || null, now, now)
      .run();

    return this.findById(id) as Promise<User>;
  }

  // 关联 GitHub 账户到现有用户
  async linkGithub(userId: string, githubId: string, avatarUrl?: string): Promise<void> {
    const now = new Date().toISOString();
    if (avatarUrl) {
      await this.env.DB.prepare(
        'UPDATE users SET github_id = ?, avatar_url = ?, updated_at = ? WHERE id = ?'
      ).bind(githubId, avatarUrl, now, userId).run();
    } else {
      await this.env.DB.prepare(
        'UPDATE users SET github_id = ?, updated_at = ? WHERE id = ?'
      ).bind(githubId, now, userId).run();
    }
  }

  // 通过 API Key 查找用户
  async findByApiKey(apiKey: string): Promise<User | null> {
    // 对传入的 API Key 进行哈希
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const row = await this.env.DB.prepare(
      'SELECT id, email, role, disabled, created_at, updated_at FROM users WHERE api_key_hash = ?'
    ).bind(hashHex).first<{
      id: string;
      email: string;
      role: string;
      disabled: number;
      created_at: string;
      updated_at: string;
    }>();

    if (!row || row.disabled) return null;

    return {
      id: row.id,
      email: row.email,
      role: row.role as 'user' | 'admin',
      disabled: !!row.disabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // ---------- API Key 管理 ----------

  // 生成 API Key（支持名称和有效期）
  async generateApiKey(userId: string, name: string = 'default', expiresInDays?: number): Promise<{ id: string; key: string; expiresAt: string | null }> {
    // 确保表存在
    try {
      await this.env.DB.prepare("SELECT 1 FROM api_keys LIMIT 1").first();
    } catch {
      await this.env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS api_keys (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          key_hash TEXT NOT NULL,
          key_prefix TEXT,
          key_suffix TEXT,
          expires_at INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `).run();
    }
    // 确保 key_prefix/key_suffix 列存在（兼容旧表）
    try { await this.env.DB.prepare("ALTER TABLE api_keys ADD COLUMN key_prefix TEXT").run(); } catch {}
    try { await this.env.DB.prepare("ALTER TABLE api_keys ADD COLUMN key_suffix TEXT").run(); } catch {}
    const { key, hash } = await createApiKeyToken();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const expiresAt = expiresInDays ? Date.now() + expiresInDays * 86400_000 : null;
    const keyPrefix = key.slice(0, 6);
    const keySuffix = key.slice(-4);
    await this.env.DB.prepare(
      'INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, key_suffix, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, userId, name, hash, keyPrefix, keySuffix, expiresAt, now, now).run();
    return { id, key, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null };
  }

  // 列出所有 API Key
  async listApiKeys(userId: string): Promise<{ id: string; name: string; maskedKey: string; expiresAt: string | null; createdAt: string }[]> {
    const { results } = await this.env.DB.prepare(
      'SELECT id, name, key_prefix, key_suffix, expires_at, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(userId).all<{ id: string; name: string; key_prefix: string; key_suffix: string; expires_at: number | null; created_at: string }>();
    return results.map(r => ({
      id: r.id,
      name: r.name,
      maskedKey: `${r.key_prefix || '……'}****${r.key_suffix || ''}`,
      expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
      createdAt: r.created_at
    }));
  }

  // 删除 API Key
  async deleteApiKey(userId: string, keyId: string): Promise<void> {
    await this.env.DB.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').bind(keyId, userId).run();
  }

  // 通过 API Key 获取用户（同时检查有效期）
  async getUserByApiKey(key: string): Promise<{ id: string } | null> {
    const hash = await hashApiKey(key);
    const row = await this.env.DB.prepare(
      'SELECT id, expires_at FROM api_keys WHERE key_hash = ?'
    ).bind(hash).first<{ id: string; expires_at: number | null }>();
    if (!row) return null;
    if (row.expires_at && Date.now() > row.expires_at) return null;
    return { id: row.id };
  }
}

// 哈希 API Key 的辅助函数
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
