import { Hono } from 'hono';
import type { Env, User } from '../../types';
import auth from './auth';
import smtp from './smtp';
import templates from './templates';
import emails from './emails';
import settings from './settings';
import user from './user';
import misc from './misc';

const api = new Hono<{ Bindings: Env; Variables: { user: User } }>();

api.route('/auth', auth);
api.route('/smtp-configs', smtp);
api.route('/templates', templates);
api.route('/emails', emails);
api.route('/settings', settings);
api.route('/user', user);
api.route('/', misc);

export default api;