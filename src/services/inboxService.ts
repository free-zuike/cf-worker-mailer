import type { Env, InboxEmail } from '../../types';
import { CFImap } from 'cf-imap';
import { SmtpService } from './smtpService';

/** IMAP 文件夹分类 */
export type FolderCategory = 'inbox' | 'spam' | 'drafts' | 'sent' | 'trash' | 'other';

/** 文件夹信息 */
export interface InboxFolder {
  name: string;
  category: FolderCategory;
  label: string;
  count: number;
}

/** 常见的文件夹名称映射（小写匹配） */
const FOLDER_MAP: { names: string[]; category: FolderCategory; label: string }[] = [
  { names: ['inbox'], category: 'inbox', label: '收件箱' },
  { names: ['spam', 'junk', '垃圾箱', '垃圾邮件'], category: 'spam', label: '垃圾箱' },
  { names: ['drafts', '草稿箱', '草稿'], category: 'drafts', label: '草稿箱' },
  { names: ['sent', 'sent mail', 'sent messages', '已发送', '已发送邮件'], category: 'sent', label: '已发送' },
  { names: ['trash', 'deleted', 'deleted items', '已删除', '回收站'], category: 'trash', label: '已删除' }
];

function classifyFolder(folderName: string): { category: FolderCategory; label: string } {
  const lower = folderName.toLowerCase();
  for (const map of FOLDER_MAP) {
    if (map.names.some(n => lower.includes(n))) {
      return { category: map.category, label: map.label };
    }
  }
  return { category: 'other', label: folderName };
}

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

  /** 获取某个配置的文件夹列表（含邮件数） */
  async getFolders(configId: string): Promise<InboxFolder[]> {
    const full = await this.smtpService.getFullConfig(configId);
    if (!full || !full.config.imapHost) throw new Error('配置不存在或未设置 IMAP');

    const imap = this.createImap(full, full.password);
    try {
      await imap.connect();
      const folders = await imap.getFolders('', '*');
      const result: InboxFolder[] = [];
      for (const f of folders) {
        const { category, label } = classifyFolder(f.name);
        const status = await imap.status(f.name, ['MESSAGES']);
        result.push({ name: f.name, category, label, count: status.MESSAGES || 0 });
      }
      return result;
    } finally {
      try { await imap.logout(); } catch {}
    }
  }

  private createImap(full: any, password: string) {
    return new CFImap({
      host: full.config.imapHost,
      port: full.config.imapPort || 993,
      tls: full.config.imapUseTls !== false,
      timeoutMs: 60000,
      auth: { username: full.config.username, password }
    });
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

    // 重试一次
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.doSync(configId, full, password);
      } catch (e) {
        console.error(`Sync attempt ${attempt + 1} failed:`, e);
        if (attempt === 1) throw e;
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    return { synced: 0, errors: 0 };
  }

  private async doSync(configId: string, full: any, password: string): Promise<{ synced: number; errors: number }> {
    const imap = this.createImap(full, password);
    let synced = 0, errors = 0;

    try {
      await imap.connect();
      const folders = await imap.getFolders('', '*');
      // 过滤掉不可选择的文件夹（如 \Noselect）
      const selectable = folders.filter(f => !f.attributes.includes('Noselect'));
      // 按分类排序：收件箱优先，其他按分类顺序
      const sorted = selectable.sort((a, b) => {
        const { category: ca } = classifyFolder(a.name);
        const { category: cb } = classifyFolder(b.name);
        const order = ['inbox', 'sent', 'drafts', 'spam', 'trash', 'other'];
        return order.indexOf(ca) - order.indexOf(cb);
      });

      for (const folderInfo of sorted) {
        try {
          const s = await this.syncFolder(imap, configId, folderInfo.name);
          synced += s.synced;
          errors += s.errors;
        } catch (e) {
          console.error(`Failed to sync folder ${folderInfo.name}:`, e);
          errors++;
        }
      }
    } finally {
      try { await imap.logout(); } catch {}
    }

    await this.updateLastSync(configId);
    return { synced, errors };
  }

  private async syncFolder(imap: CFImap, configId: string, folderName: string): Promise<{ synced: number; errors: number }> {
    const mailbox = await imap.selectFolder(folderName);
    const totalMessages = mailbox.emails || 0;
    if (totalMessages === 0) return { synced: 0, errors: 0 };

    // 获取该文件夹已同步的最大 UID
    const maxUidRow = await this.env.DB.prepare(
      'SELECT MAX(uid) as max_uid FROM inbox_emails WHERE account_id = ? AND folder = ?'
    ).bind(configId, folderName).first<any>();
    const maxUid = maxUidRow?.max_uid || 0;
    let synced = 0, errors = 0;

    const fetchRange: [number, number] = maxUid > 0
      ? [maxUid + 1, (mailbox.uidNext || maxUid + 1) - 1]
      : [1, totalMessages];

    if (fetchRange[0] > fetchRange[1]) return { synced: 0, errors: 0 };

    // 只拉取头部信息，不拉取正文（节省 CPU）
    const batchSize = 10;
    for (let start = fetchRange[0]; start <= fetchRange[1]; start += batchSize) {
      const end = Math.min(start + batchSize - 1, fetchRange[1]);
      try {
        const emails = await imap.fetchEmails({ limit: [start, end], fetchBody: false, peek: true, useUid: maxUid > 0 });
        for (const email of emails) {
          try {
            await this.storeEmail(configId, email, folderName, false);
            synced++;
          } catch (e) {
            console.error('Failed to store email:', e);
            errors++;
          }
        }
      } catch (e) {
        console.error(`Batch failed in ${folderName}:`, start, '-', end, ':', e);
        errors++;
        break;
      }
    }
    return { synced, errors };
  }

  private async updateLastSync(accountId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.env.DB.prepare('UPDATE smtp_configs SET updated_at = ? WHERE id = ?').bind(now, accountId).run();
  }

  private async storeEmail(accountId: string, email: any, folder: string, hasContent: boolean): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const existing = await this.env.DB.prepare(
      'SELECT id FROM inbox_emails WHERE account_id = ? AND uid = ?'
    ).bind(accountId, email.uid).first();
    if (existing) return;

    await this.env.DB.prepare(
      `INSERT INTO inbox_emails (id, account_id, user_id, uid, folder, sender, recipient, cc, subject, html, text, attachments, flags, internal_date, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, accountId, this.userId, email.uid, folder,
      email.from?.join(', ') || '',
      email.to?.join(', ') || '',
      email.cc?.join(', ') || '',
      email.subject || '',
      hasContent ? (email.body?.html || '') : '',
      hasContent ? (email.body?.text || '') : '',
      hasContent ? JSON.stringify(email.attachments || []) : '[]',
      JSON.stringify(email.flags || []),
      email.internalDate ? new Date(email.internalDate).toISOString() : now,
      (email.flags || []).includes('Seen') ? 1 : 0,
      now
    ).run();
  }

  /** 获取某封邮件的完整内容（按需拉取，连接 IMAP 获取正文） */
  async fetchEmailContent(id: string): Promise<InboxEmail | null> {
    const row = await this.env.DB.prepare(
      'SELECT id, account_id, user_id, uid, folder, sender, recipient, cc, subject, html, text, attachments, flags, internal_date, is_read, created_at FROM inbox_emails WHERE id = ? AND user_id = ?'
    ).bind(id, this.userId).first<any>();
    if (!row) return null;

    // 如果已有正文，直接返回
    if (row.html || row.text) {
      if (!row.is_read) {
        await this.env.DB.prepare('UPDATE inbox_emails SET is_read = 1 WHERE id = ?').bind(id).run();
      }
      const email = this.mapEmail(row);
      email.isRead = true;
      return email;
    }

    // 否则连接 IMAP 拉取完整内容
    try {
      const full = await this.smtpService.getFullConfig(row.account_id);
      if (!full || !full.config.imapHost) return this.mapEmail(row);

      const imap = this.createImap(full, full.imapPassword || full.password);
      await imap.connect();
      await imap.selectFolder(row.folder || 'INBOX');
      const emails = await imap.fetchEmails({ limit: [row.uid, row.uid], useUid: true, fetchBody: true, peek: true });
      await imap.logout().catch(() => {});

      if (emails.length > 0) {
        const email = emails[0];
        await this.env.DB.prepare(
          'UPDATE inbox_emails SET html = ?, text = ?, attachments = ?, is_read = 1 WHERE id = ?'
        ).bind(email.body?.html || '', email.body?.text || '', JSON.stringify(email.attachments || []), id).run();
        row.html = email.body?.html || '';
        row.text = email.body?.text || '';
        row.attachments = JSON.stringify(email.attachments || []);
      }
    } catch (e) {
      console.error('Failed to fetch email content:', e);
    }

    if (!row.is_read) {
      await this.env.DB.prepare('UPDATE inbox_emails SET is_read = 1 WHERE id = ?').bind(id).run();
    }
    const email = this.mapEmail(row);
    email.isRead = true;
    return email;
  }

  // ============ 邮件列表 ============

  async listEmails(accountId: string, folder: string = 'INBOX', page: number = 1, pageSize: number = 20): Promise<{ emails: InboxEmail[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const folderClause = folder === 'ALL' ? '' : 'AND folder = ?';
    const folderParams = folder === 'ALL' ? [] : [folder];
    const { total } = await this.env.DB.prepare(
      `SELECT COUNT(*) as total FROM inbox_emails WHERE account_id = ? AND user_id = ? ${folderClause}`
    ).bind(accountId, this.userId, ...folderParams).first<any>();
    const { results } = await this.env.DB.prepare(
      `SELECT id, account_id, user_id, uid, folder, sender, recipient, cc, subject, html, text, attachments, flags, internal_date, is_read, created_at FROM inbox_emails WHERE account_id = ? AND user_id = ? ${folderClause} ORDER BY internal_date DESC LIMIT ? OFFSET ?`
    ).bind(accountId, this.userId, ...folderParams, pageSize, offset).all<any>();
    return {
      emails: results.map(r => this.mapEmail(r)),
      total: total || 0
    };
  }

  private mapEmail(r: any): InboxEmail {
    return {
      id: r.id,
      accountId: r.account_id,
      userId: r.user_id,
      uid: r.uid,
      folder: r.folder,
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
    };
  }

  async getEmail(id: string): Promise<InboxEmail | null> {
    const row = await this.env.DB.prepare(
      'SELECT id, account_id, user_id, uid, folder, sender, recipient, cc, subject, html, text, attachments, flags, internal_date, is_read, created_at FROM inbox_emails WHERE id = ? AND user_id = ?'
    ).bind(id, this.userId).first<any>();
    if (!row) return null;
    if (!row.is_read) {
      await this.env.DB.prepare('UPDATE inbox_emails SET is_read = 1 WHERE id = ?').bind(id).run();
    }
    const email = this.mapEmail(row);
    email.isRead = true;
    return email;
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