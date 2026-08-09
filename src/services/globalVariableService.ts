import type { Env } from '../../types';

export interface GlobalVariable {
  id: string;
  key: string;
  defaultValue: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/** 规范化变量名：去掉两端的花括号，如 {{name}} -> name */
function normalizeKey(key: string): string {
  return key.replace(/^\{\{/, '').replace(/\}\}$/, '').trim();
}

export class GlobalVariableService {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async list(): Promise<GlobalVariable[]> {
    const { results } = await this.env.DB.prepare(
      'SELECT id, key, default_value, description, created_at, updated_at FROM global_variables ORDER BY key ASC'
    ).all<{
      id: string;
      key: string;
      default_value: string;
      description?: string;
      created_at: string;
      updated_at: string;
    }>();
    return results.map(r => ({
      id: r.id,
      key: r.key,
      defaultValue: r.default_value,
      description: r.description,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  async create(key: string, defaultValue: string, description?: string): Promise<GlobalVariable> {
    const cleanKey = normalizeKey(key);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.env.DB.prepare(
      'INSERT INTO global_variables (id, key, default_value, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, cleanKey, defaultValue, description || null, now, now).run();
    return this.get(id) as Promise<GlobalVariable>;
  }

  async update(id: string, key: string, defaultValue: string, description?: string): Promise<GlobalVariable> {
    const cleanKey = normalizeKey(key);
    const now = new Date().toISOString();
    await this.env.DB.prepare(
      'UPDATE global_variables SET key = ?, default_value = ?, description = ?, updated_at = ? WHERE id = ?'
    ).bind(cleanKey, defaultValue, description || null, now, id).run();
    return this.get(id) as Promise<GlobalVariable>;
  }

  async delete(id: string): Promise<void> {
    await this.env.DB.prepare('DELETE FROM global_variables WHERE id = ?').bind(id).run();
  }

  private async get(id: string): Promise<GlobalVariable | null> {
    const row = await this.env.DB.prepare(
      'SELECT id, key, default_value, description, created_at, updated_at FROM global_variables WHERE id = ?'
    ).bind(id).first<{
      id: string;
      key: string;
      default_value: string;
      description?: string;
      created_at: string;
      updated_at: string;
    }>();
    if (!row) return null;
    return {
      id: row.id,
      key: row.key,
      defaultValue: row.default_value,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /** 获取所有变量的键值映射（用于模板渲染） */
  async getKeyValueMap(): Promise<Record<string, string>> {
    const list = await this.list();
    const map: Record<string, string> = {};
    for (const v of list) {
      // 确保 key 不带花括号，兼容旧数据
      map[normalizeKey(v.key)] = v.defaultValue;
    }
    return map;
  }
}