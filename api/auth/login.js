// POST /api/auth/login
import { getRedis, KEYS } from '../../lib/redis.js';
import { allowMethods, readJsonBody, sendJson, sendError, handleError } from '../../lib/responses.js';
import { getClientIp, isBlocked, addFailure } from '../../lib/ratelimit.js';
import { verifyCredentials, createSession, buildSessionCookie, checkOrigin, sessionTtl } from '../../lib/auth.js';

const MAX_FAILS = 5;
const WINDOW_SEC = 15 * 60;

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  try {
    if (!checkOrigin(req)) return sendError(res, 403, 'FORBIDDEN', 'Permintaan ditolak.');

    const body = readJsonBody(req, res);
    if (!body) return;

    const { username, password } = body;
    if (
      typeof username !== 'string' || typeof password !== 'string' ||
      !username || !password || username.length > 100 || password.length > 200
    ) {
      return sendError(res, 400, 'VALIDATION', 'Username dan password wajib diisi.');
    }

    const redis = getRedis();
    const key = KEYS.rlLogin(getClientIp(req));

    if (await isBlocked(redis, key, MAX_FAILS)) {
      res.setHeader('Retry-After', String(WINDOW_SEC));
      return sendError(res, 429, 'TOO_MANY_ATTEMPTS', 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.');
    }

    if (!verifyCredentials(username, password)) {
      await addFailure(redis, key, WINDOW_SEC);
      return sendError(res, 401, 'INVALID_CREDENTIALS', 'Username atau password salah.');
    }

    await redis.del(key);
    const { sid, csrf } = await createSession(redis);
    res.setHeader('Set-Cookie', buildSessionCookie(sid, sessionTtl()));
    return sendJson(res, 200, { ok: true, csrfToken: csrf });
  } catch (err) {
    return handleError(res, err, 'auth/login');
  }
}
