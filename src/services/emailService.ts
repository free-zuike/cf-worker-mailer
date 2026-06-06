import type {
  Env,
  EmailRequest,
  EmailResponse,
  EmailHistory,
  EmailTemplate,
  CreateEmailTemplateRequest,
  UpdateEmailTemplateRequest,
  TemplateVariable
} from '../../types';
import { decrypt } from '../utils/crypto';
import { SmtpService } from './smtpService';
import { WorkerMailer } from 'worker-mailer';

export class EmailService {
  private env: Env;
  private userId: string;
  private smtpService: SmtpService;

  constructor(env: Env, userId: string) {
    this.env = env;
    this.userId = userId;
    this.smtpService = new SmtpService(env, userId);
  }

  async sendEmail(request: EmailRequest): Promise<EmailResponse> {
    let html = request.html;
    let text = request.text;
    let subject = request.subject;

    if (request.templateId) {
      const template = await this.getTemplate(request.templateId);
      if (template) {
        subject = template.subject;
        if (template.htmlContent) {
          html = this.applyTemplateVariables(template.htmlContent, request.templateVariables || {}, template.variables);
        }
        if (template.textContent) {
          text = this.applyTemplateVariables(template.textContent, request.templateVariables || {}, template.variables);
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
        request.async ? 'pending' : 'pending',
        now
      )
      .run();

    if (request.async) {
      await this.env.MAIL_QUEUE.send({
        emailId: id,
        userId: this.userId
      });

      return {
        id,
        status: 'pending',
        createdAt: now
      };
    }

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

  private async sendViaSMTP(
    smtpConfig: { config: any; password: string },
    email: {
      from: string;
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      html?: string;
      text?: string;
      attachments?: any[];
    }
  ): Promise<void> {
    const host = smtpConfig.config.host || '';
    
    // 测试模式 - 如果配置包含 example 或 test 则模拟发送
    if (host.includes('example') || host.includes('test') || !host) {
      console.log('🔍 [Test Mode] 模拟发送邮件:', {
        from: email.from,
        to: email.to,
        subject: email.subject
      });
      await new Promise(resolve => setTimeout(resolve, 200));
      console.log('✅ [Test Mode] 邮件发送模拟成功！');
      return;
    }

    // 使用 worker-mailer 发送真实邮件
    console.log('📧 发送真实邮件:', {
      host: host,
      port: smtpConfig.config.port,
      username: smtpConfig.config.username
    });

    try {
      // 根据端口自动设置 TLS/STARTTLS 配置
      const isOutlook = host.includes('outlook') || host.includes('office365');
      const port = smtpConfig.config.port;
      let secure = port === 465; // 465端口通常使用隐式TLS
      let startTls = port === 587; // 587端口通常使用STARTTLS
      
      // Outlook 特定配置
      if (isOutlook && port === 587) {
        startTls = true;
        secure = false;
      }

      const mailer = await WorkerMailer.connect({
        host: host,
        port: port,
        secure: secure,
        requireTLS: startTls,
        credentials: {
          username: smtpConfig.config.username,
          password: smtpConfig.password,
        },
        authType: ['plain', 'login', 'cram-md5'],  // 支持多种认证方式
      });

      await mailer.send({
        from: { 
          name: smtpConfig.config.fromName || '', 
          email: this.extractEmailAddress(email.from) 
        },
        to: email.to.map(t => ({ email: t })),
        cc: email.cc?.map(c => ({ email: c })),
        bcc: email.bcc?.map(b => ({ email: b })),
        subject: email.subject,
        text: email.text,
        html: email.html,
      });

      console.log('✅ 邮件发送成功！');
    } catch (error) {
      console.error('❌ 邮件发送失败:', error);
      
      // 为 Outlook 提供额外的错误指导
      const isOutlook = host.includes('outlook') || host.includes('office365');
      if (isOutlook) {
        const errorMsg = (error as Error).message;
        if (errorMsg.includes('535') || errorMsg.includes('Authentication')) {
          throw new Error(
            'Outlook 认证失败！请检查：\n' +
            '1. 确保使用正确的邮箱地址和应用密码（不是普通密码）\n' +
            '2. 如果启用了双因素验证，需要创建应用密码\n' +
            '3. 创建应用密码步骤：微软账户 -> 安全 -> 高级安全选项 -> 应用密码\n\n' +
            '原始错误: ' + errorMsg
          );
        }
      }
      
      throw error;
    }
  }

  private extractEmailAddress(fromHeader: string): string {
    const match = fromHeader.match(/<([^>]+)>/);
    return match ? match[1] : fromHeader.trim();
  }

  private applyTemplateVariables(
    content: string,
    variables: Record<string, string>,
    templateVariables?: TemplateVariable[]
  ): string {
    let result = content;
    
    const allVariables = new Map<string, string>();
    if (templateVariables) {
      templateVariables.forEach(v => allVariables.set(v.key, v.defaultValue));
    }
    
    Object.entries(variables).forEach(([key, value]) => {
      allVariables.set(key, value);
    });

    allVariables.forEach((value, key) => {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });

    return result;
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

  async createTemplate(template: CreateEmailTemplateRequest): Promise<EmailTemplate> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.env.DB.prepare(
      'INSERT INTO email_templates (id, user_id, name, subject, html_content, text_content, variables, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(
        id,
        this.userId,
        template.name,
        template.subject,
        template.htmlContent || null,
        template.textContent || null,
        template.variables ? JSON.stringify(template.variables) : null,
        now,
        now
      )
      .run();

    return this.getTemplate(id) as Promise<EmailTemplate>;
  }

  async updateTemplate(id: string, updates: UpdateEmailTemplateRequest): Promise<EmailTemplate> {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.subject !== undefined) {
      fields.push('subject = ?');
      values.push(updates.subject);
    }
    if (updates.htmlContent !== undefined) {
      fields.push('html_content = ?');
      values.push(updates.htmlContent);
    }
    if (updates.textContent !== undefined) {
      fields.push('text_content = ?');
      values.push(updates.textContent);
    }
    if (updates.variables !== undefined) {
      fields.push('variables = ?');
      values.push(JSON.stringify(updates.variables));
    }
    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);
    values.push(this.userId);

    await this.env.DB.prepare(
      `UPDATE email_templates SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
    ).bind(...values).run();

    return this.getTemplate(id) as Promise<EmailTemplate>;
  }

  async deleteTemplate(id: string): Promise<void> {
    await this.env.DB.prepare(
      'DELETE FROM email_templates WHERE id = ? AND user_id = ?'
    ).bind(id, this.userId).run();
  }

  async getTemplate(id: string): Promise<EmailTemplate | null> {
    const row = await this.env.DB.prepare(
      'SELECT id, user_id, name, subject, html_content, text_content, variables, created_at, updated_at FROM email_templates WHERE id = ? AND user_id = ?'
    ).bind(id, this.userId).first<{
      id: string;
      user_id: string;
      name: string;
      subject: string;
      html_content?: string;
      text_content?: string;
      variables?: string;
      created_at: string;
      updated_at: string;
    }>();

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      subject: row.subject,
      htmlContent: row.html_content,
      textContent: row.text_content,
      variables: row.variables ? JSON.parse(row.variables) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async listTemplates(): Promise<EmailTemplate[]> {
    const { results } = await this.env.DB.prepare(
      'SELECT id, user_id, name, subject, html_content, text_content, variables, created_at, updated_at FROM email_templates WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(this.userId).all<{
      id: string;
      user_id: string;
      name: string;
      subject: string;
      html_content?: string;
      text_content?: string;
      variables?: string;
      created_at: string;
      updated_at: string;
    }>();

    return results.map(row => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      subject: row.subject,
      htmlContent: row.html_content,
      textContent: row.text_content,
      variables: row.variables ? JSON.parse(row.variables) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
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
