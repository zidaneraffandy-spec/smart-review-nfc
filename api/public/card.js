// GET /api/public/card?id=KARTU001-XXXXXX  (tanpa login)
import { getRedis, KEYS } from '../../lib/redis.js';
import { allowMethods, sendJson, sendError, handleError } from '../../lib/responses.js';
import { isValidCardId, toPublicCard } from '../../lib/cards.js';
import { rateLimit, getClientIp } from '../../lib/ratelimit.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const redis = getRedis();

    const rl = await rateLimit(redis, KEYS.rlPublic(getClientIp(req)), 60, 60);
    if (!rl.ok) {
      res.setHeader('Retry-After', '60');
      return sendError(res, 429, 'RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi sebentar lagi.');
    }

    const id = req.query.id;
    if (!isValidCardId(id)) return sendJson(res, 404, { ok: false, status: 'not_found' });

    const card = await redis.get(KEYS.card(id));
    if (!card) return sendJson(res, 404, { ok: false, status: 'not_found' });

    if (card.status === 'active') {
      return sendJson(res, 200, { ok: true, status: 'active', card: toPublicCard(card) });
    }
    if (card.status === 'pending' || card.status === 'inactive') {
      // Hanya status; tidak ada data toko yang dikirim.
      return sendJson(res, 403, { ok: false, status: card.status });
    }
    return sendJson(res, 404, { ok: false, status: 'not_found' });
  } catch (err) {
    return handleError(res, err, 'public/card');
  }
}
