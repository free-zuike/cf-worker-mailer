import type { Env } from '../../types';

export interface Contact {
  id: string;
  userId: string;
  name: string;
  email: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export class ContactService {
  private env: Env;
  private userId: string;

  constructor(env: Env, userId: string) {
    this.env = env;
    this.userId = userId;
  }

  async list(): Promise<Contact[]> {
    const { results } = await this.env.DB.prepare(
      'SELECT id, user_id, name, email, remark, created_at, updated_at FROM contacts WHERE user_id = ? ORDER BY name ASC'
    ).bind(this.userId).all<{
      id: string; user_id: string; name: string; email: string;
      remark?: string; created_at: string; updated_at: string;
    }>();
    return results.map(r => ({
      id: r.id, userId: r.user_id, name: r.name, email: r.email,
      remark: r.remark, createdAt: r.created_at, updatedAt: r.updated_at
    }));
  }

  async create(name: string, email: string, remark?: string): Promise<Contact> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.env.DB.prepare(
      'INSERT INTO contacts (id, user_id, name, email, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, this.userId, name, email, remark || null, now, now).run();
    return this.get(id) as Promise<Contact>;
  }

  async update(id: string, name: string, email: string, remark?: string): Promise<Contact> {
    const now = new Date().toISOString();
    await this.env.DB.prepare(
      'UPDATE contacts SET name = ?, email = ?, remark = ?, updated_at = ? WHERE id = ? AND user_id = ?'
    ).bind(name, email, remark || null, now, id, this.userId).run();
    return this.get(id) as Promise<Contact>;
  }

  async delete(id: string): Promise<void> {
    await this.env.DB.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?').bind(id, this.userId).run();
  }

  private async get(id: string): Promise<Contact | null> {
    const row = await this.env.DB.prepare(
      'SELECT id, user_id, name, email, remark, created_at, updated_at FROM contacts WHERE id = ? AND user_id = ?'
    ).bind(id, this.userId).first<any>();
    if (!row) return null;
    return {
      id: row.id, userId: row.user_id, name: row.name, email: row.email,
      remark: row.remark, createdAt: row.created_at, updatedAt: row.updated_at
    };
  }
}