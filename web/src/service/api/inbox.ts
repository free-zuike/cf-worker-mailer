import { request } from '../request';

export interface InboxAccount {
  id: string;
  userId: string;
  name: string;
  host: string;
  port: number;
  username: string;
  useTls: boolean;
  syncInterval: number;
  lastSyncAt?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

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

// ============ 账户管理 ============

export function fetchInboxAccounts() {
  return request<{ accounts: InboxAccount[] }>({ url: '/inbox/accounts' });
}

export function createInboxAccount(data: { name: string; host: string; port: number; username: string; password: string; useTls?: boolean; syncInterval?: number }) {
  return request<{ account: InboxAccount }>({ url: '/inbox/accounts', method: 'post', data });
}

export function updateInboxAccount(id: string, data: any) {
  return request<{ account: InboxAccount }>({ url: `/inbox/accounts/${id}`, method: 'put', data });
}

export function deleteInboxAccount(id: string) {
  return request<{ success: boolean }>({ url: `/inbox/accounts/${id}`, method: 'delete' });
}

export function syncInboxAccount(id: string) {
  return request<{ synced: number; errors: number }>({ url: `/inbox/accounts/${id}/sync`, method: 'post' });
}

// ============ 邮件管理 ============

export function fetchInboxEmails(accountId: string, page = 1, pageSize = 20) {
  return request<{ emails: InboxEmail[]; total: number }>({ url: `/inbox/emails/${accountId}`, params: { page, pageSize } });
}

export function fetchInboxEmail(id: string) {
  return request<{ email: InboxEmail }>({ url: `/inbox/email/${id}` });
}

export function deleteInboxEmail(id: string) {
  return request<{ success: boolean }>({ url: `/inbox/email/${id}`, method: 'delete' });
}

export function markInboxEmailRead(id: string) {
  return request<{ success: boolean }>({ url: `/inbox/email/${id}/read`, method: 'post' });
}

export function fetchInboxUnreadCount(accountId: string) {
  return request<{ count: number }>({ url: `/inbox/unread/${accountId}` });
}