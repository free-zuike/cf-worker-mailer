import { request } from '../request';
import type { SmtpConfig } from './smtp';

export interface InboxEmail {
  id: string;
  accountId: string;
  uid: number;
  folder?: string;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: string;
  flags?: string;
  internalDate: string;
  isRead: boolean;
  createdAt: string;
}

export interface InboxFolder {
  name: string;
  category: 'inbox' | 'spam' | 'drafts' | 'sent' | 'trash' | 'other';
  label: string;
  count: number;
}

// 获取支持 IMAP 的 SMTP 配置
export function fetchInboxConfigs() {
  return request<{ configs: SmtpConfig[] }>({ url: '/inbox/configs' });
}

// 同步某个配置的收件箱
export function syncInbox(configId: string) {
  return request<{ synced: number; errors: number }>({ url: `/inbox/sync/${configId}`, method: 'post' });
}

// 获取文件夹列表
export function fetchInboxFolders(configId: string) {
  return request<{ folders: InboxFolder[] }>({ url: `/inbox/folders/${configId}` });
}

// 列出邮件（支持文件夹筛选）
export function fetchInboxEmails(configId: string, folder = 'INBOX', page = 1, pageSize = 20) {
  return request<{ emails: InboxEmail[]; total: number }>({ url: `/inbox/emails/${configId}`, params: { folder, page, pageSize } });
}

// 邮件详情
export function fetchInboxEmail(id: string) {
  return request<{ email: InboxEmail }>({ url: `/inbox/email/${id}` });
}

// 获取邮件完整内容（正文，按需拉取）
export function fetchInboxEmailFull(id: string) {
  return request<{ email: InboxEmail }>({ url: `/inbox/email/${id}/full` });
}

// 删除邮件
export function deleteInboxEmail(id: string) {
  return request<{ success: boolean }>({ url: `/inbox/email/${id}`, method: 'delete' });
}

// 未读数
export function fetchInboxUnreadCount(configId: string) {
  return request<{ count: number }>({ url: `/inbox/unread/${configId}` });
}