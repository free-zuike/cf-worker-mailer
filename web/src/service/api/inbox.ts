import { request } from '../request';
import type { SmtpConfig } from './smtp';

export interface InboxEmail {
  id: string;
  accountId: string;
  uid: number;
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

// 获取支持 IMAP 的 SMTP 配置
export function fetchInboxConfigs() {
  return request<{ configs: SmtpConfig[] }>({ url: '/inbox/configs' });
}

// 同步某个配置的收件箱
export function syncInbox(configId: string) {
  return request<{ synced: number; errors: number }>({ url: `/inbox/sync/${configId}`, method: 'post' });
}

// 列出邮件
export function fetchInboxEmails(configId: string, page = 1, pageSize = 20) {
  return request<{ emails: InboxEmail[]; total: number }>({ url: `/inbox/emails/${configId}`, params: { page, pageSize } });
}

// 邮件详情
export function fetchInboxEmail(id: string) {
  return request<{ email: InboxEmail }>({ url: `/inbox/email/${id}` });
}

// 删除邮件
export function deleteInboxEmail(id: string) {
  return request<{ success: boolean }>({ url: `/inbox/email/${id}`, method: 'delete' });
}

// 未读数
export function fetchInboxUnreadCount(configId: string) {
  return request<{ count: number }>({ url: `/inbox/unread/${configId}` });
}