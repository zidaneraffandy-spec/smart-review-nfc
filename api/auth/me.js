// GET /api/auth/me  -> cek sesi, kembalikan token CSRF
import { getRedis } from '../../lib/redis.js';
import { allowMethods, sendJson, handleError } from '../../lib/responses.js';
import { requireAuth } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const redis = getRedis();
    const auth = await requireAuth(req, res, redis);
    if (!auth) return;
    return sendJson(res, 200, { ok: true, authenticated: true, csrfToken: auth.session.csrf });
  } catch (err) {
    return handleError(res, err, 'auth/me');
  }
}
