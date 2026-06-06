// 简单的加密工具（用于存储敏感数据）
// 注意：生产环境应该使用更强的加密方案
const SECRET_KEY = 'worker-mailer-secret-key-change-in-production';

export async function encrypt(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const keyBytes = encoder.encode(SECRET_KEY);
  
  const encrypted = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    encrypted[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  return btoa(String.fromCharCode(...encrypted));
}

export async function decrypt(encrypted: string): Promise<string> {
  const decoder = new TextDecoder();
  const keyBytes = new TextEncoder().encode(SECRET_KEY);
  const encryptedBytes = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  
  const decrypted = new Uint8Array(encryptedBytes.length);
  for (let i = 0; i < encryptedBytes.length; i++) {
    decrypted[i] = encryptedBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  return decoder.decode(decrypted);
}
