import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, generateToken } from './password';

describe('password', () => {
  it('should hash and verify password', async () => {
    const password = 'test-password-123';
    const hash = await hashPassword(password);
    expect(hash).toContain(':');

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  it('should reject wrong password', async () => {
    const hash = await hashPassword('correct-password');
    const isValid = await verifyPassword('wrong-password', hash);
    expect(isValid).toBe(false);
  });

  it('should generate token', () => {
    const token = generateToken();
    expect(token).toBeTruthy();
    expect(token.length).toBe(64);
  });
});