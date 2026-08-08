import { Hono } from 'hono';
import type { Env, User } from '../../types';
import { authMiddleware } from '../middleware/auth';
import { PreferencesService } from '../services/preferencesService';

const user = new Hono<{ Bindings: Env; Variables: { user: User } }>();

user.use('*', authMiddleware);

user.get('/preferences', async (c) => {
  const u = c.get('user');
  const prefsService = new PreferencesService(c.env, u.id);
  const prefs = await prefsService.getPreferences();
  return c.json({ preferences: prefs });
});

user.put('/preferences', async (c) => {
  const u = c.get('user');
  const body = await c.req.json();
  const prefsService = new PreferencesService(c.env, u.id);
  const prefs = await prefsService.savePreferences(body.preferences ?? {});
  return c.json({ preferences: prefs });
});

export default user;