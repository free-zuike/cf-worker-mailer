import type { Env, InboxAccount, InboxEmail } from '../../types';
import { CFImap } from 'cf-imap';

const ENCRYPTION_KEY = 'inbox-enc-key';

export class InboxService {
  private env: Env;
  private userId: string;

  constructor(env: Env, userId: string) {
    this.env = env;
    this.userId = userId;
  }

  // ============ 账户管理 ============

  async listAccounts(): Promise<InboxAccount[]> {
    const { results } = await this.env.DB.prepare(
      'SELECT id, user_id, name, host, port, username, use_tls, sync_interval, last_sync_at, enabled, created_at, updated_at FROM inbox_accounts WHERE user_id = ? ORDER BY name ASC'
    ).bind(this.userId).all<any>();
    return results.map(r => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      host: r.host,
      port: r.port,
      username: r.username,
      useTls: !!r.use_tls,
      syncInterval: r.sync_interval,
      lastSyncAt: r.last_sync_at,
      enabled: !!r.enabled,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  async createAccount(data: { name: string; host: string; port: number; username: string; password: string; useTls?: boolean; syncInterval?: number }): Promise<InboxAccount> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.env.DB.prepare(
      'INSERT INTO inbox_accounts (id, user_id, name, host, port, username, password, use_tls, sync_interval, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
    ).bind(id, this.userId, data.name, data.host, data.port, data.username, data.password, data.useTls ? 1 : 0, data.syncInterval || 15, now, now).run();
    return (await this.getAccount(id))!;
  }

  async updateAccount(id: string, data: any): Promise<InboxAccount> {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const vals: any[] = [];
    if (data.name !== undefined) { sets.push('name = ?'); vals.push(data.name); }
    if (data.host !== undefined) { sets.push('host = ?'); vals.push(data.host); }
    if (data.port !== undefined) { sets.push('port = ?'); vals.push(data.port); }
    if (data.username !== undefined) { sets.push('username = ?'); vals.push(data.username); }
    if (data.password !== undefined) { sets.push('password = ?'); vals.push(data.password); }
    if (data.useTls !== undefined) { sets.push('use_tls = ?'); vals.push(data.useTls ? 1 : 0); }
    if (data.syncInterval !== undefined) { sets.push('sync_interval = ?'); vals.push(data.syncInterval); }
    if (data.enabled !== undefined) { sets.push('enabled = ?'); vals.push(data.enabled ? 1 : 0); }
    sets.push('updated_at = ?'); vals.push(now);
    vals.push(id, this.userId);
    await this.env.DB.prepare(`UPDATE inbox_accounts SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...vals).run();
    return (await this.getAccount(id))!;
  }

  async deleteAccount(id: string): Promise<void> {
    await this.env.DB.prepare('DELETE FROM inbox_emails WHERE account_id = ? AND user_id = ?').bind(id, this.userId).run();
    await this.env.DB.prepare('DELETE FROM inbox_accounts WHERE id = ? AND user_id = ?').bind(id, this.userId).run();
  }

  private async getAccount(id: string): Promise<InboxAccount | null> {
    const row = await this.env.DB.prepare(
      'SELECT id, user_id, name, host, port, username, use_tls, sync_interval, last_sync_at, enabled, created_at, updated_at FROM inbox_accounts WHERE id = ? AND user_id = ?'
    ).bind(id, this.userId).first<any>();
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      host: row.host,
      port: row.port,
      username: row.username,
      useTls: !!row.use_tls,
      syncInterval: row.sync_interval,
      lastSyncAt: row.last_sync_at,
      enabled: !!row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // ============ 同步邮件 ============

  async syncAccount(accountId: string): Promise<{ synced: number; errors: number }> {
    const row = await this.env.DB.prepare(
      'SELECT id, user_id, name, host, port, username, password, use_tls FROM inbox_accounts WHERE id = ? AND user_id = ?'
    ).bind(accountId, this.userId).first<any>();
    if (!row) throw new Error('账户不存在');

    const imap = new CFImap({
      host: row.host,
      port: row.port,
      tls: !!row.use_tls,
      auth: { username: row.username, password: row.password }
    });

    await imap.connect();
    const mailbox = await imap.selectFolder('INBOX');
    const totalMessages = mailbox.emails || 0;
    if (totalMessages === 0) {
      await imap.logout();
      await this.updateLastSync(accountId);
      return { synced: 0, errors: 0 };
    }

    // 获取已同步的 UID 集合，避免重复
    const syncedUids = await this.getSyncedUids(accountId);
    let synced = 0, errors = 0;

    // 分批获取（每批 50 封），按序列号范围
    const batchSize = 50;
    for (let start = 1; start <= totalMessages; start += batchSize) {
      const end = Math.min(start + batchSize - 1, totalMessages);
      const emails = await imap.fetchEmails({ limit: [start, end], fetchBody: true });
      for (const email of emails) {
        if (syncedUids.has(email.uid)) continue;
        try {
          await this.storeEmail(accountId, email);
          synced++;
        } catch (e) {
          console.error('Failed to store email:', e);
          errors++;
        }
      }
    }

    await imap.logout();
    await this.updateLastSync(accountId);
    return { synced, errors };
  }

  private async getSyncedUids(accountId: string): Promise<Set<number>> {
    const { results } = await this.env.DB.prepare(
      'SELECT uid FROM inbox_emails WHERE account_id = ?'
    ).bind(accountId).all<any>();
    return new Set(results.map(r => r.uid));
  }

  private async updateLastSync(accountId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.env.DB.prepare('UPDATE inbox_accounts SET last_sync_at = ? WHERE id = ?').bind(now, accountId).run();
  }

  private async storeEmail(accountId: string, email: any): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const existing = await this.env.DB.prepare(
      'SELECT id FROM inbox_emails WHERE account_id = ? AND uid = ?'
    ).bind(accountId, email.uid).first();
    if (existing) return; // 已存在，跳过

    await this.env.DB.prepare(
      `INSERT INTO inbox_emails (id, account_id, user_id, uid, sender, recipient, cc, subject, html, text, attachments, flags, internal_date, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, accountId, this.userId, email.uid,
      email.from?.join(', ') || '',
      email.to?.join(', ') || '',
      email.cc?.join(', ') || '',
      email.subject || '',
      email.body?.html || '',
      email.body?.text || '',
      JSON.stringify(email.attachments || []),
      JSON.stringify(email.flags || []),
      email.internalDate ? new Date(email.internalDate).toISOString() : now,
      (email.flags || []).includes('Seen') ? 1 : 0,
      now
    ).run();
  }

  // ============ 邮件列表 ============

  async listEmails(accountId: string, page: number = 1, pageSize: number = 20): Promise<{ emails: InboxEmail[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const { total } = await this.env.DB.prepare(
      'SELECT COUNT(*) as total FROM inbox_emails WHERE account_id = ? AND user_id = ?'
    ).bind(accountId, this.userId).first<any>();
    const { results } = await this.env.DB.prepare(
      'SELECT id, account_id, user_id, uid, sender, recipient, cc, subject, html, text, attachments, flags, internal_date, is_read, created_at FROM inbox_emails WHERE account_id = ? AND user_id = ? ORDER BY internal_date DESC LIMIT ? OFFSET ?'
    ).bind(accountId, this.userId, pageSize, offset).all<any>();
    return {
      emails: results.map(r => ({
        id: r.id,
        accountId: r.account_id,
        userId: r.user_id,
        uid: r.uid,
        from: r.sender,
        to: r.recipient,
        cc: r.cc,
        subject: r.subject,
        html: r.html,
        text: r.text,
        attachments: r.attachments,
        flags: r.flags,
        internalDate: r.internal_date,
        isRead: !!r.is_read,
        createdAt: r.created_at
      })),
      total: total || 0
    };
  }

  async getEmail(id: string): Promise<InboxEmail | null> {
    const row = await this.env.DB.prepare(
      'SELECT id, account_id, user_id, uid, sender, recipient, cc, subject, html, text, attachments, flags, internal_date, is_read, created_at FROM inbox_emails WHERE id = ? AND user_id = ?'
    ).bind(id, this.userId).first<any>();
    if (!row) return null;
    // 标记为已读
    if (!row.is_read) {
      await this.env.DB.prepare('UPDATE inbox_emails SET is_read = 1 WHERE id = ?').bind(id).run();
    }
    return {
      id: row.id,
      accountId: row.account_id,
      userId: row.user_id,
      uid: row.uid,
      from: row.sender,
      to: row.recipient,
      cc: row.cc,
      subject: row.subject,
      html: row.html,
      text: row.text,
      attachments: row.attachments,
      flags: row.flags,
      internalDate: row.internal_date,
      isRead: true,
      createdAt: row.created_at
    };
  }

  async deleteEmail(id: string): Promise<void> {
    await this.env.DB.prepare('DELETE FROM inbox_emails WHERE id = ? AND user_id = ?').bind(id, this.userId).run();
  }

  async markAsRead(id: string): Promise<void> {
    await this.env.DB.prepare('UPDATE inbox_emails SET is_read = 1 WHERE id = ? AND user_id = ?').bind(id, this.userId).run();
  }

  async getUnreadCount(accountId: string): Promise<number> {
    const row = await this.env.DB.prepare(
      'SELECT COUNT(*) as count FROM inbox_emails WHERE account_id = ? AND user_id = ? AND is_read = 0'
    ).bind(accountId, this.userId).first<any>();
    return row?.count || 0;
  }
}