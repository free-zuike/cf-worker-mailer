import { request } from '../request';

export interface Attachment {
  filename: string;
  content: string;
  contentType?: string;
}

export interface SendEmailParams {
  from?: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  templateId?: string;
  templateVariables?: Record<string, string>;
  attachments?: Attachment[];
  configId?: string;
  async?: boolean;
}

export interface SendEmailResponse {
  id: string;
  status: 'pending' | 'sent' | 'failed';
  createdAt: string;
}

export interface EmailHistoryItem {
  id: string;
  userId: string;
  configId?: string;
  templateId?: string;
  fromEmail: string;
  toEmails: string[];
  ccEmails?: string[];
  bccEmails?: string[];
  subject: string;
  htmlContent?: string;
  textContent?: string;
  status: 'pending' | 'sent' | 'failed';
  errorMessage?: string;
  sentAt?: string;
  createdAt: string;
}

export interface Metrics {
  total: number;
  sent: number;
  failed: number;
  pending: number;
}

/** 发送邮件 */
export function sendEmail(data: SendEmailParams) {
  return request<SendEmailResponse>({
    url: '/emails',
    method: 'post',
    data
  });
}

/** 获取发送历史 */
export function fetchEmailHistory(limit = 50, offset = 0) {
  return request<{ history: EmailHistoryItem[] }>({
    url: `/emails?limit=${limit}&offset=${offset}`
  });
}

/** 获取单条发送记录 */
export function fetchEmail(id: string) {
  return request<{ email: EmailHistoryItem }>({ url: `/emails/${id}` });
}

/** 获取统计 */
export function fetchMetrics() {
  return request<{ metrics: Metrics }>({ url: '/metrics' });
}