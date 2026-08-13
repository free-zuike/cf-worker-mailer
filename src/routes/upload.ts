import { Hono } from 'hono';
import type { Env, User } from '../../types';
import { authMiddleware } from '../middleware/auth';

const upload = new Hono<{ Bindings: Env; Variables: { user: User } }>();

upload.use('*', authMiddleware);

/** 上传图片到 R2，返回可访问的 URL */
upload.post('/image', async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.parseBody();
    const file = body['file'] as File | null;

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    if (!file.type.startsWith('image/')) {
      return c.json({ error: 'Only image files are allowed' }, 400);
    }

    if (file.size > 10 * 1024 * 1024) {
      return c.json({ error: 'File size exceeds 10MB limit' }, 400);
    }

    const ext = file.name.split('.').pop() || 'png';
    const key = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    await c.env.R2_UPLOAD_BUCKET.put(key, arrayBuffer, {
      httpMetadata: { contentType: file.type }
    });

    const origin = new URL(c.req.url).origin;
    const url = `${origin}/api/uploads/${key}`;
    return c.json({ errno: 0, data: { url } });
  } catch (error) {
    console.error('Upload error:', error);
    return c.json({ error: 'Upload failed' }, 500);
  }
});

/** 上传附件（任意文件类型）到 R2，返回 base64 内容用于邮件发送 */
upload.post('/attachment', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'] as File | null;

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    if (file.size > 20 * 1024 * 1024) {
      return c.json({ error: 'File size exceeds 20MB limit' }, 400);
    }

    // 读取文件内容并转为 base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    return c.json({
      filename: file.name,
      content: base64,
      contentType: file.type || 'application/octet-stream',
      size: file.size
    });
  } catch (error) {
    console.error('Upload attachment error:', error);
    return c.json({ error: 'Upload failed' }, 500);
  }
});

export default upload;