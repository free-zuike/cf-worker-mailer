// 使用 Web Crypto API 的 AES-GCM 加密
// 密钥必须通过 ENCRYPTION_KEY 环境变量传入

export function requireEncryptionKey(env: { ENCRYPTION_KEY?: string }): string {
  const key = env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required. ' +
      'Set it in wrangler.toml [vars] or via `wrangler secret put ENCRYPTION_KEY`.'
    );
  }
  return key;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

async function getKey(secretKey: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const salt = encoder.encode('worker-mailer-salt-v1');
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(data: string, secretKey: string): Promise<string> {
  const key = await getKey(secretKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(data)
  );

  // 将 IV 和加密数据组合在一起
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return bytesToHex(combined);
}

export async function decrypt(encrypted: string, secretKey: string): Promise<string> {
  const key = await getKey(secretKey);
  const combined = hexToBytes(encrypted);

  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return new TextDecoder().decode(decrypted);
}
