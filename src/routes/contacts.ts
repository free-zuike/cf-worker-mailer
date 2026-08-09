import { Hono } from 'hono';
import type { Env, User } from '../../types';
import { authMiddleware } from '../middleware/auth';
import { ContactService } from '../services/contactService';

const contacts = new Hono<{ Bindings: Env; Variables: { user: User } }>();

contacts.use('*', authMiddleware);

contacts.get('/', async (c) => {
  const svc = new ContactService(c.env, c.get('user').id);
  const list = await svc.list();
  return c.json({ contacts: list });
});

contacts.post('/', async (c) => {
  const { name, email, remark } = await c.req.json();
  if (!name || !email) return c.json({ error: 'Name and email are required' }, 400);
  const svc = new ContactService(c.env, c.get('user').id);
  const contact = await svc.create(name, email, remark);
  return c.json({ contact }, 201);
});

contacts.put('/:id', async (c) => {
  const { name, email, remark } = await c.req.json();
  if (!name || !email) return c.json({ error: 'Name and email are required' }, 400);
  const svc = new ContactService(c.env, c.get('user').id);
  const contact = await svc.update(c.req.param('id'), name, email, remark);
  return c.json({ contact });
});

contacts.delete('/:id', async (c) => {
  const svc = new ContactService(c.env, c.get('user').id);
  await svc.delete(c.req.param('id'));
  return c.json({ success: true });
});

export default contacts;