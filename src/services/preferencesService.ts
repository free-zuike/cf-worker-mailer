import type { Env } from '../../types';
import type { UserPreferences } from '../../types';

const defaultPreferences: UserPreferences = {
  theme: 'light'
};

export class PreferencesService {
  private env: Env;
  private userId: string;

  constructor(env: Env, userId: string) {
    this.env = env;
    this.userId = userId;
  }

  async getPreferences(): Promise<UserPreferences> {
    try {
      const row = await this.env.DB.prepare(
        'SELECT preferences FROM user_preferences WHERE user_id = ?'
      ).bind(this.userId).first<{ preferences: string }>();
      if (row) {
        const parsed = JSON.parse(row.preferences);
        return { ...defaultPreferences, ...parsed };
      }
    } catch (e) {
      console.warn('Failed to load preferences', e);
    }
    return { ...defaultPreferences };
  }

  async savePreferences(preferences: Partial<UserPreferences>): Promise<UserPreferences> {
    const current = await this.getPreferences();
    const toSave: UserPreferences = {
      theme: preferences.theme ?? current.theme
    };
    const now = new Date().toISOString();
    const json = JSON.stringify(toSave);
    const existing = await this.env.DB.prepare(
      'SELECT 1 FROM user_preferences WHERE user_id = ?'
    ).bind(this.userId).first();
    if (existing) {
      await this.env.DB.prepare(
        'UPDATE user_preferences SET preferences = ?, updated_at = ? WHERE user_id = ?'
      ).bind(json, now, this.userId).run();
    } else {
      await this.env.DB.prepare(
        'INSERT INTO user_preferences (user_id, preferences, created_at, updated_at) VALUES (?, ?, ?, ?)'
      ).bind(this.userId, json, now, now).run();
    }
    return toSave;
  }
}
