import type { Env, InboxEmail } from '../../types';
import { CFImap } from 'cf-imap';
import { SmtpService } from './smtpService';

export class InboxService {
  private env: Env;
  private userId: string;
  private smtpService: SmtpService;

  constructor(env: Env, userId: string) {
    this.env = env;
    this.userId = userId;
    this.smtpService = new SmtpService(env, userId);
  }

  /** 获取支持 IMAP 的 SMTP 配置列表 */
  async getImapEnabledConfigs() {
    const configs = await this.smtpService.findAll();
    return configs.filter(c => c.imapHost);
  }

  /** 同步指定 SMTP 配置的 IMAP 收件箱 */
  async syncByConfigId(configId: string): Promise<{ synced: number; errors: number }> {
    const full = await this.smtpService.getFullConfig(configId);
    if (!full) throw new Error('配置不存在');
    if (!full.config.imapHost) throw new Error('该配置未设置 IMAP 收件服务器');

    const password = full.imapPassword || full.password;
    if (!full.config.username || !password) {
      throw new Error('IMAP 用户名或密码为空，请在发件配置中检查 SMTP 密码和 IMAP 授权码');
    }

    const imap = new CFImap({
      host: full.config.imapHost,
      port: full.config.imapPort || 993,
      tls: full.config.imapUseTls !== false,
      timeoutMs: 30000,
      auth: { username: full.config.username, password }
    });

    await imap.connect();
    const mailbox = await imap.selectFolder('INBOX');
    const totalMessages = mailbox.emails || 0;
    if (totalMessages === 0) {
      await imap.logout();
      await this.updateLastSync(configId);
      return { synced: 0, errors: 0 };
    }

    const syncedUids = await this.getSyncedUids(configId);
    let synced = 0, errors = 0;

    const batchSize = 10;
    for (let start = 1; start <= totalMessages; start += batchSize) {
      const end = Math.min(start + batchSize - 1, totalMessages);
      try {
        const emails = await imap.fetchEmails({ limit: [start, end], fetchBody: true, peek: true });
        for (const email of emails) {
          if (syncedUids.has(email.uid)) continue;
          try {
            await this.storeEmail(configId, email);
            synced++;
          } catch (e) {
            console.error('Failed to store email:', e);
            errors++;
          }
        }
      } catch (e) {
        console.error('Batch failed, reconnecting...', start, '-', end, ':', e);
        errors++;
        // 断开后重新连接，从下一批继续
        try { await imap.logout(); } catch {}
        try {
          await imap.connect();
          await imap.selectFolder('INBOX');
        } catch (reconnectErr) {
          console.error('Reconnect failed, aborting sync:', reconnectErr);
          break;
        }
      }
    }

    await imap.logout();
    await this.updateLastSync(configId);
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
    await this.env.DB.prepare('UPDATE smtp_configs SET updated_at = ? WHERE id = ?').bind(now, accountId).run();
  }

  private async storeEmail(accountId: string, email: any): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const existing = await this.env.DB.prepare(
      'SELECT id FROM inbox_emails WHERE account_id = ? AND uid = ?'
    ).bind(accountId, email.uid).first();
    if (existing) return;

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

  async getUnreadCount(accountId: string): Promise<number> {
    const row = await this.env.DB.prepare(
      'SELECT COUNT(*) as count FROM inbox_emails WHERE account_id = ? AND user_id = ? AND is_read = 0'
    ).bind(accountId, this.userId).first<any>();
    return row?.count || 0;
  }
}