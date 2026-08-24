import type {
  Env,
  EmailRequest,
  EmailResponse,
  EmailHistory,
  SmtpConfig
} from '../../types';
import { SmtpService } from './smtpService';
import { TemplateService } from './templateService';
import { GlobalVariableService } from './globalVariableService';
import { WorkerMailer } from 'worker-mailer';

export class EmailService {
  private env: Env;
  private userId: string;
  private smtpService: SmtpService;
  private templateService: TemplateService;
  private globalVariableService: GlobalVariableService;

  constructor(env: Env, userId: string) {
    this.env = env;
    this.userId = userId;
    this.smtpService = new SmtpService(env, userId);
    this.templateService = new TemplateService(env, userId);
    this.globalVariableService = new GlobalVariableService(env);
  }

  async sendEmail(request: EmailRequest): Promise<EmailResponse> {
    let html = request.html;
    let text = request.text;
    let subject = request.subject;

    if (request.templateId) {
      const template = await this.templateService.get(request.templateId);
      if (template) {
        // 用户如果自己提供了内容，优先用用户的；没提供才从模板取
        if (!subject) subject = template.subject;
        if (!html && template.htmlContent) {
          html = this.templateService.applyVariables(template.htmlContent, request.templateVariables || {}, template.variables);
        }
        if (!text && template.textContent) {
          text = this.templateService.applyVariables(template.textContent, request.templateVariables || {}, template.variables);
        }
      }
    }

    // 全局变量替换
    const globalVars = await this.globalVariableService.getKeyValueMap();
    if (html) {
      html = this.templateService.applyVariables(html, { ...globalVars, ...(request.templateVariables || {}) });
    }
    if (text) {
      text = this.templateService.applyVariables(text, { ...globalVars, ...(request.templateVariables || {}) });
    }

    const toEmails = Array.isArray(request.to) ? request.to : [request.to];
    const ccEmails = request.cc ? (Array.isArray(request.cc) ? request.cc : [request.cc]) : undefined;
    const bccEmails = request.bcc ? (Array.isArray(request.bcc) ? request.bcc : [request.bcc]) : undefined;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    let configId = request.configId;
    let fromEmail = request.from;

    if (!configId) {
      throw new Error('请选择发件配置');
    }

    // 从发件配置中读取发件人
    const smtpConfig = await this.smtpService.findById(configId);
    if (!smtpConfig) {
      throw new Error('发件配置不存在');
    }
    if (!fromEmail) {
      fromEmail = `${smtpConfig.fromName ? `"${smtpConfig.fromName}" ` : ''}<${smtpConfig.fromEmail}>`;
    }

    await this.env.DB.prepare(
      'INSERT INTO email_history (id, user_id, config_id, template_id, from_email, to_emails, cc_emails, bcc_emails, subject, html_content, text_content, attachments, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(
        id,
        this.userId,
        configId,
        request.templateId || null,
        fromEmail,
        JSON.stringify(toEmails),
        ccEmails ? JSON.stringify(ccEmails) : null,
        bccEmails ? JSON.stringify(bccEmails) : null,
        subject,
        html || null,
        text || null,
        request.attachments ? JSON.stringify(request.attachments) : null,
        'pending',
        now
      )
      .run();

    await this.processEmail(id);
    const history = await this.getHistory(id);
    return {
      id,
      status: history?.status || 'failed',
      createdAt: now
    };
  }

  async processEmail(emailId: string): Promise<void> {
    const history = await this.getHistory(emailId);
    if (!history) {
      return;
    }

    try {
      const fullConfig = await this.smtpService.getFullConfig(history.configId!);
      if (!fullConfig) {
        throw new Error('SMTP configuration not found');
      }

      await this.sendViaSMTP(fullConfig, {
        from: history.fromEmail,
        to: history.toEmails,
        cc: history.ccEmails,
        bcc: history.bccEmails,
        subject: history.subject,
        html: history.htmlContent,
        text: history.textContent,
        attachments: history.attachments
      });

      await this.updateHistoryStatus(emailId, 'sent');
    } catch (error) {
      await this.updateHistoryStatus(emailId, 'failed', (error as Error).message);
      throw error;
    }
  }

  /** 重试发送失败的邮件 */
  async retryFailedEmail(emailId: string): Promise<void> {
    const history = await this.getHistory(emailId);
    if (!history) {
      throw new Error('Email not found');
    }
    if (history.status !== 'failed') {
      throw new Error('Only failed emails can be retried');
    }
    await this.updateHistoryStatus(emailId, 'pending');
    await this.processEmail(emailId);
  }

  private async sendViaSMTP(
    smtpConfig: { config: SmtpConfig; password: string },
    email: {
      from: string;
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      html?: string;
      text?: string;
      attachments?: EmailRequest['attachments'];
    }
  ): Promise<void> {
    const config = smtpConfig.config;
    const port = config.port || 587;
    const secure = port === 465;
    const startTls = port !== 465;

    await WorkerMailer.send(
      {
        host: config.host,
        port: port,
        secure: secure,
        startTls: startTls,
        credentials: {
          username: config.username,
          password: smtpConfig.password
        },
        authType: ['plain', 'login']
      },
      {
        from: { email: config.fromEmail, name: config.fromName || undefined },
        to: email.to,
        cc: email.cc,
        bcc: email.bcc,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: email.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          mimeType: a.contentType
        }))
      }
    );
  }

  async getHistory(id: string): Promise<EmailHistory | null> {
    const row = await this.env.DB.prepare(
      'SELECT id, user_id, config_id, template_id, from_email, to_emails, cc_emails, bcc_emails, subject, html_content, text_content, attachments, status, error_message, sent_at, created_at FROM email_history WHERE id = ? AND user_id = ?'
    ).bind(id, this.userId).first<{
      id: string;
      user_id: string;
      config_id?: string;
      template_id?: string;
      from_email: string;
      to_emails: string;
      cc_emails?: string;
      bcc_emails?: string;
      subject: string;
      html_content?: string;
      text_content?: string;
      attachments?: string;
      status: string;
      error_message?: string;
      sent_at?: string;
      created_at: string;
    }>();

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      configId: row.config_id,
      templateId: row.template_id,
      fromEmail: row.from_email,
      toEmails: JSON.parse(row.to_emails),
      ccEmails: row.cc_emails ? JSON.parse(row.cc_emails) : undefined,
      bccEmails: row.bcc_emails ? JSON.parse(row.bcc_emails) : undefined,
      subject: row.subject,
      htmlContent: row.html_content,
      textContent: row.text_content,
      attachments: row.attachments ? JSON.parse(row.attachments) : undefined,
      status: row.status as 'pending' | 'sent' | 'failed',
      errorMessage: row.error_message,
      sentAt: row.sent_at,
      createdAt: row.created_at
    };
  }

  async listHistory(limit: number = 50, offset: number = 0): Promise<EmailHistory[]> {
    const { results } = await this.env.DB.prepare(
      'SELECT id, user_id, config_id, template_id, from_email, to_emails, cc_emails, bcc_emails, subject, html_content, text_content, attachments, status, error_message, sent_at, created_at FROM email_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).bind(this.userId, limit, offset).all<{
      id: string;
      user_id: string;
      config_id?: string;
      template_id?: string;
      from_email: string;
      to_emails: string;
      cc_emails?: string;
      bcc_emails?: string;
      subject: string;
      html_content?: string;
      text_content?: string;
      attachments?: string;
      status: string;
      error_message?: string;
      sent_at?: string;
      created_at: string;
    }>();

    return results.map(row => ({
      id: row.id,
      userId: row.user_id,
      configId: row.config_id,
      templateId: row.template_id,
      fromEmail: row.from_email,
      toEmails: JSON.parse(row.to_emails),
      ccEmails: row.cc_emails ? JSON.parse(row.cc_emails) : undefined,
      bccEmails: row.bcc_emails ? JSON.parse(row.bcc_emails) : undefined,
      subject: row.subject,
      htmlContent: row.html_content,
      textContent: row.text_content,
      attachments: row.attachments ? JSON.parse(row.attachments) : undefined,
      status: row.status as 'pending' | 'sent' | 'failed',
      errorMessage: row.error_message,
      sentAt: row.sent_at,
      createdAt: row.created_at
    }));
  }

  private async updateHistoryStatus(id: string, status: 'sent' | 'failed' | 'pending', errorMessage?: string): Promise<void> {
    const now = new Date().toISOString();
    await this.env.DB.prepare(
      'UPDATE email_history SET status = ?, error_message = ?, sent_at = ? WHERE id = ? AND user_id = ?'
    )
      .bind(
        status,
        errorMessage || null,
        status === 'sent' ? now : null,
        id,
        this.userId
      )
      .run();
  }

  async getMetrics(): Promise<{ total: number; sent: number; failed: number; pending: number }> {
    const row = await this.env.DB.prepare(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM email_history WHERE user_id = ?`
    ).bind(this.userId).first<{
      total: number;
      sent: number;
      failed: number;
      pending: number;
    }>();

    return row || { total: 0, sent: 0, failed: 0, pending: 0 };
  }
}