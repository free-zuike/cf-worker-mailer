import { Hono } from 'hono';
import type { Env, User } from '../../types';
import { authMiddleware } from '../middleware/auth';
import { GlobalVariableService } from '../services/globalVariableService';

const variables = new Hono<{ Bindings: Env; Variables: { user: User } }>();

variables.use('*', authMiddleware);

variables.get('/', async (c) => {
  const svc = new GlobalVariableService(c.env);
  const list = await svc.list();
  return c.json({ variables: list });
});

variables.post('/', async (c) => {
  const { key, defaultValue, description } = await c.req.json();
  if (!key) return c.json({ error: 'Key is required' }, 400);
  const svc = new GlobalVariableService(c.env);
  const v = await svc.create(key, defaultValue || '', description);
  return c.json({ variable: v }, 201);
});

variables.put('/:id', async (c) => {
  const id = c.req.param('id');
  const { key, defaultValue, description } = await c.req.json();
  if (!key) return c.json({ error: 'Key is required' }, 400);
  const svc = new GlobalVariableService(c.env);
  const v = await svc.update(id, key, defaultValue || '', description);
  return c.json({ variable: v });
});

variables.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const svc = new GlobalVariableService(c.env);
  await svc.delete(id);
  return c.json({ success: true });
});

export default variables;