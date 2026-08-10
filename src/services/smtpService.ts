import type { Env, SmtpConfig, CreateSmtpConfigRequest, UpdateSmtpConfigRequest } from '../../types';
import { encrypt, decrypt, requireEncryptionKey } from '../utils/crypto';

export class SmtpService {
  private env: Env;
  private userId: string;
  private _encryptionKey: string | null = null;

  constructor(env: Env, userId: string) {
    this.env = env;
    this.userId = userId;
  }

  private getEncryptionKey(): string {
    if (!this._encryptionKey) {
      this._encryptionKey = requireEncryptionKey(this.env);
    }
    return this._encryptionKey;
  }

  async create(config: CreateSmtpConfigRequest): Promise<SmtpConfig> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const encryptedPassword = config.password ? await encrypt(config.password, this.getEncryptionKey()) : '';
    const encryptedImapPassword = config.imapPassword ? await encrypt(config.imapPassword, this.getEncryptionKey()) : null;

    await this.env.DB.prepare(
      'INSERT INTO smtp_configs (id, user_id, name, type, host, port, username, password, from_email, from_name, secure, enabled, imap_host, imap_port, imap_use_tls, imap_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(
        id,
        this.userId,
        config.name,
        config.type || 'smtp',
        config.host || null,
        config.port || null,
        config.username || null,
        encryptedPassword,
        config.fromEmail,
        config.fromName || null,
        config.secure !== false ? 1 : 0,
        config.enabled !== false ? 1 : 0,
        config.imapHost || null,
        config.imapPort || null,
        config.imapUseTls !== false ? 1 : 0,
        encryptedImapPassword,
        now,
        now
      )
      .run();

    return this.findById(id) as Promise<SmtpConfig>;
  }

  async update(id: string, updates: UpdateSmtpConfigRequest): Promise<SmtpConfig> {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.type !== undefined) {
      fields.push('type = ?');
      values.push(updates.type);
    }
    if (updates.host !== undefined) {
      fields.push('host = ?');
      values.push(updates.host);
    }
    if (updates.port !== undefined) {
      fields.push('port = ?');
      values.push(updates.port);
    }
    if (updates.username !== undefined) {
      fields.push('username = ?');
      values.push(updates.username);
    }
    if (updates.password !== undefined) {
      fields.push('password = ?');
      values.push(await encrypt(updates.password, this.getEncryptionKey()));
    }
    if (updates.fromEmail !== undefined) {
      fields.push('from_email = ?');
      values.push(updates.fromEmail);
    }
    if (updates.fromName !== undefined) {
      fields.push('from_name = ?');
      values.push(updates.fromName);
    }
    if (updates.secure !== undefined) {
      fields.push('secure = ?');
      values.push(updates.secure ? 1 : 0);
    }
    if (updates.enabled !== undefined) {
      fields.push('enabled = ?');
      values.push(updates.enabled ? 1 : 0);
    }
    if (updates.imapHost !== undefined) {
      fields.push('imap_host = ?');
      values.push(updates.imapHost);
    }
    if (updates.imapPort !== undefined) {
      fields.push('imap_port = ?');
      values.push(updates.imapPort);
    }
    if (updates.imapUseTls !== undefined) {
      fields.push('imap_use_tls = ?');
      values.push(updates.imapUseTls ? 1 : 0);
    }
    if (updates.imapPassword !== undefined) {
      fields.push('imap_password = ?');
      values.push(updates.imapPassword ? await encrypt(updates.imapPassword, this.getEncryptionKey()) : null);
    }
    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);
    values.push(this.userId);

    await this.env.DB.prepare(
      `UPDATE smtp_configs SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
    ).bind(...values).run();

    return this.findById(id) as Promise<SmtpConfig>;
  }

  async delete(id: string): Promise<void> {
    await this.env.DB.prepare(
      'DELETE FROM smtp_configs WHERE id = ? AND user_id = ?'
    ).bind(id, this.userId).run();
  }

  async findById(id: string): Promise<SmtpConfig | null> {
    const row = await this.env.DB.prepare(
      'SELECT id, user_id, name, type, host, port, username, from_email, from_name, secure, enabled, imap_host, imap_port, imap_use_tls, created_at, updated_at FROM smtp_configs WHERE id = ? AND user_id = ?'
    ).bind(id, this.userId).first<{
      id: string;
      user_id: string;
      name: string;
      type?: string;
      host: string;
      port: number;
      username: string;
      from_email: string;
      from_name?: string;
      secure: number;
      enabled: number;
      imap_host?: string;
      imap_port?: number;
      imap_use_tls?: number;
      created_at: string;
      updated_at: string;
    }>();

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      type: row.type as 'smtp' | 'mailchannels',
      host: row.host,
      port: row.port,
      username: row.username,
      fromEmail: row.from_email,
      fromName: row.from_name,
      secure: !!row.secure,
      enabled: !!row.enabled,
      imapHost: row.imap_host || undefined,
      imapPort: row.imap_port || undefined,
      imapUseTls: row.imap_use_tls ? true : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async findAll(): Promise<SmtpConfig[]> {
    const { results } = await this.env.DB.prepare(
      'SELECT id, user_id, name, type, host, port, username, from_email, from_name, secure, enabled, imap_host, imap_port, imap_use_tls, created_at, updated_at FROM smtp_configs WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(this.userId).all<{
      id: string;
      user_id: string;
      name: string;
      type?: string;
      host: string;
      port: number;
      username: string;
      from_email: string;
      from_name?: string;
      secure: number;
      enabled: number;
      imap_host?: string;
      imap_port?: number;
      imap_use_tls?: number;
      created_at: string;
      updated_at: string;
    }>();

    return results.map(row => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      type: row.type as 'smtp' | 'mailchannels',
      host: row.host,
      port: row.port,
      username: row.username,
      fromEmail: row.from_email,
      fromName: row.from_name,
      secure: !!row.secure,
      enabled: !!row.enabled,
      imapHost: row.imap_host || undefined,
      imapPort: row.imap_port || undefined,
      imapUseTls: row.imap_use_tls ? true : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async getDefaultConfig(): Promise<SmtpConfig | null> {
    const row = await this.env.DB.prepare(
      'SELECT id, user_id, name, type, host, port, username, password, from_email, from_name, secure, enabled, created_at, updated_at FROM smtp_configs WHERE user_id = ? AND enabled = 1 ORDER BY created_at DESC LIMIT 1'
    ).bind(this.userId).first<{
      id: string;
      user_id: string;
      name: string;
      type?: string;
      host: string;
      port: number;
      username: string;
      password: string;
      from_email: string;
      from_name?: string;
      secure: number;
      enabled: number;
      created_at: string;
      updated_at: string;
    }>();

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      type: row.type as 'smtp' | 'mailchannels',
      host: row.host,
      port: row.port,
      username: row.username,
      fromEmail: row.from_email,
      fromName: row.from_name,
      secure: !!row.secure,
      enabled: !!row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async getFullConfig(id: string): Promise<{ config: SmtpConfig; password: string; imapPassword?: string } | null> {
    const row = await this.env.DB.prepare(
      'SELECT id, user_id, name, type, host, port, username, password, from_email, from_name, secure, enabled, imap_host, imap_port, imap_use_tls, imap_password, created_at, updated_at FROM smtp_configs WHERE id = ? AND user_id = ?'
    ).bind(id, this.userId).first<{
      id: string;
      user_id: string;
      name: string;
      type?: string;
      host: string;
      port: number;
      username: string;
      password: string;
      from_email: string;
      from_name?: string;
      secure: number;
      enabled: number;
      imap_host?: string;
      imap_port?: number;
      imap_use_tls?: number;
      imap_password?: string;
      created_at: string;
      updated_at: string;
    }>();

    if (!row) return null;

    const password = row.password ? await decrypt(row.password, this.getEncryptionKey()) : '';
    const imapPassword = row.imap_password ? await decrypt(row.imap_password, this.getEncryptionKey()) : undefined;

    return {
      config: {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        type: row.type as 'smtp' | 'mailchannels',
        host: row.host,
        port: row.port,
        username: row.username,
        fromEmail: row.from_email,
        fromName: row.from_name,
        secure: !!row.secure,
        enabled: !!row.enabled,
        imapHost: row.imap_host || undefined,
        imapPort: row.imap_port || undefined,
        imapUseTls: row.imap_use_tls ? true : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      },
      password,
      imapPassword
    };
  }
}
