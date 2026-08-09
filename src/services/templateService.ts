import type {
  Env,
  EmailTemplate,
  CreateEmailTemplateRequest,
  UpdateEmailTemplateRequest,
  TemplateVariable
} from '../../types';

export class TemplateService {
  private env: Env;
  private userId: string;

  constructor(env: Env, userId: string) {
    this.env = env;
    this.userId = userId;
  }

  async create(template: CreateEmailTemplateRequest): Promise<EmailTemplate> {
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

    return this.get(id) as Promise<EmailTemplate>;
  }

  async update(id: string, updates: UpdateEmailTemplateRequest): Promise<EmailTemplate> {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: unknown[] = [];

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

    return this.get(id) as Promise<EmailTemplate>;
  }

  async delete(id: string): Promise<void> {
    await this.env.DB.prepare(
      'DELETE FROM email_templates WHERE id = ? AND user_id = ?'
    ).bind(id, this.userId).run();
  }

  async get(id: string): Promise<EmailTemplate | null> {
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

  async list(): Promise<EmailTemplate[]> {
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

  /** 将变量渲染进模板内容。使用 `\{{变量名}}` 可保留原文不替换 */
  applyVariables(
    content: string,
    variables: Record<string, string>,
    templateVariables?: TemplateVariable[]
  ): string {
    const allVariables = new Map<string, string>();
    if (templateVariables) {
      templateVariables.forEach(v => allVariables.set(v.key, v.defaultValue));
    }
    Object.entries(variables).forEach(([key, value]) => {
      allVariables.set(key, value);
    });

    // 第一步：处理转义 —— 把 \{{ 和 &#92;{{ 替换为占位符，避免被替换
    const ESCAPED_PLACEHOLDER = '\x00ESCAPED_BRACE\x00';
    let result = content
      // wangEditor 可能把 \ 存为 HTML 实体 &#92;
      .replace(/&#92;\{\{/g, ESCAPED_PLACEHOLDER)
      // 也可能直接存反斜杠
      .replace(/\\\{\{/g, ESCAPED_PLACEHOLDER);

    // 第二步：替换变量
    allVariables.forEach((value, key) => {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });

    // 第三步：占位符恢复为 {{
    result = result.replace(new RegExp(ESCAPED_PLACEHOLDER, 'g'), '{{');

    return result;
  }
}