// POST /api/auth/logout
import { getRedis, KEYS } from '../../lib/redis.js';
import { allowMethods, sendJson, handleError } from '../../lib/responses.js';
import { requireAuth, buildSessionCookie } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  try {
    const redis = getRedis();
    const auth = await requireAuth(req, res, redis, { write: true });
    if (!auth) return;
    await redis.del(KEYS.session(auth.sid));
    res.setHeader('Set-Cookie', buildSessionCookie('', 0));
    return sendJson(res, 200, { ok: true });
  } catch (err) {
    return handleError(res, err, 'auth/logout');
  }
}
