import type { Env } from '../../types';
import { decrypt } from '../utils/crypto';

export class CaptchaService {
  private env: Env;
  private userId: string;
  private secretKey: string;

  constructor(env: Env, userId: string, secretKey: string) {
    this.env = env;
    this.userId = userId;
    this.secretKey = secretKey;
  }

  async verify(token: string): Promise<boolean> {
    if (!token || !this.secretKey) {
      return false;
    }

    // 尝试解密密钥
    let key = this.secretKey;
    try {
      key = await decrypt(this.secretKey);
    } catch (e) {
      // 如果解密失败，就用原值（可能就是明文）
    }

    if (!key) {
      return false;
    }

    // Cloudflare Turnstile 验证
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        secret: key,
        response: token
      })
    });

    if (!response.ok) {
      return false;
    }

    const result = await response.json() as { success: boolean };
    return result.success;
  }
}