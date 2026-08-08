import { Hono } from 'hono';
import type { Env, User } from '../../types';
import { authMiddleware } from '../middleware/auth';
import { TemplateService } from '../services/templateService';

const templates = new Hono<{ Bindings: Env; Variables: { user: User } }>();

templates.use('*', authMiddleware);

templates.get('/', async (c) => {
  const user = c.get('user');
  const templateService = new TemplateService(c.env, user.id);
  const list = await templateService.list();
  return c.json({ templates: list });
});

templates.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const templateService = new TemplateService(c.env, user.id);
  const template = await templateService.get(id);
  if (!template) {
    return c.json({ error: 'Template not found' }, 404);
  }
  return c.json({ template });
});

templates.post('/', async (c) => {
  const user = c.get('user');
  const data = await c.req.json();
  const templateService = new TemplateService(c.env, user.id);
  const template = await templateService.create(data);
  return c.json({ template }, 201);
});

templates.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const data = await c.req.json();
  const templateService = new TemplateService(c.env, user.id);
  const template = await templateService.update(id, data);
  return c.json({ template });
});

templates.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const templateService = new TemplateService(c.env, user.id);
  await templateService.delete(id);
  return c.json({ success: true });
});

export default templates;