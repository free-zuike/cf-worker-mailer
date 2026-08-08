import type {
  Env,
  EmailRequest,
  EmailResponse,
  EmailHistory,
  SmtpConfig
} from '../../types';
import { SmtpService } from './smtpService';
import { TemplateService } from './templateService';
import { WorkerMailer } from 'worker-mailer';

export class EmailService {
  private env: Env;
  private userId: string;
  private smtpService: SmtpService;
  private templateService: TemplateService;

  constructor(env: Env, userId: string) {
    this.env = env;
    this.userId = userId;
    this.smtpService = new SmtpService(env, userId);
    this.templateService = new TemplateService(env, userId);
  }

  async sendEmail(request: EmailRequest): Promise<EmailResponse> {
    let html = request.html;
    let text = request.text;
    let subject = request.subject;

    if (request.templateId) {
      const template = await this.templateService.get(request.templateId);
      if (template) {
        subject = template.subject;
        if (template.htmlContent) {
          html = this.templateService.applyVariables(template.htmlContent, request.templateVariables || {}, template.variables);
        }
        if (template.textContent) {
          text = this.templateService.applyVariables(template.textContent, request.templateVariables || {}, template.variables);
        }
      }
    }

    const toEmails = Array.isArray(request.to) ? request.to : [request.to];
    const ccEmails = request.cc ? (Array.isArray(request.cc) ? request.cc : [request.cc]) : undefined;
    const bccEmails = request.bcc ? (Array.isArray(request.bcc) ? request.bcc : [request.bcc]) : undefined;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    let configId = request.configId;
    let fromEmail = request.from;

    if (!configId || !fromEmail) {
      const defaultConfig = await this.smtpService.getDefaultConfig();
      if (!defaultConfig) {
        throw new Error('No SMTP configuration found');
      }
      configId = configId || defaultConfig.id;
      fromEmail = fromEmail || `${defaultConfig.fromName ? `"${defaultConfig.fromName}" ` : ''}<${defaultConfig.fromEmail}>`;
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

      if (fullConfig.config.type === 'mailchannels') {
        await this.sendViaMailChannels(fullConfig.config, {
          from: history.fromEmail,
          to: history.toEmails,
          cc: history.ccEmails,
          bcc: history.bccEmails,
          subject: history.subject,
          html: history.htmlContent,
          text: history.textContent,
          attachments: history.attachments
        });
      } else {
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
      }

      await this.updateHistoryStatus(emailId, 'sent');
    } catch (error) {
      await this.updateHistoryStatus(emailId, 'failed', (error as Error).message);
      throw error;
    }
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
        }
      },
      {
        from: email.from,
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

  private async sendViaMailChannels(
    config: SmtpConfig,
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
    const personalizations = [
      {
        to: email.to.map(addr => ({ email: addr })),
        ...(email.cc ? { cc: email.cc.map(addr => ({ email: addr })) } : {}),
        ...(email.bcc ? { bcc: email.bcc.map(addr => ({ email: addr })) } : {}),
        subject: email.subject
      }
    ];

    const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        personalizations,
        from: { email: config.fromEmail, name: config.fromName || '' },
        subject: email.subject,
        content: [
          ...(email.text ? [{ type: 'text/plain', value: email.text }] : []),
          ...(email.html ? [{ type: 'text/html', value: email.html }] : [])
        ],
        ...(email.attachments ? { attachments: email.attachments } : {})
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MailChannels send failed: ${response.status} ${errorText}`);
    }
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

  private async updateHistoryStatus(id: string, status: 'sent' | 'failed', errorMessage?: string): Promise<void> {
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