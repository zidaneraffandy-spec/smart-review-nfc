// POST /api/admin/cards/:id/status  { action: 'deactivate' | 'activate' }
import { getRedis, KEYS } from '../../../../lib/redis.js';
import { allowMethods, readJsonBody, sendJson, sendError, handleError } from '../../../../lib/responses.js';
import { requireAuth } from '../../../../lib/auth.js';
import { isValidCardId } from '../../../../lib/cards.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  try {
    const redis = getRedis();
    const auth = await requireAuth(req, res, redis, { write: true });
    if (!auth) return;

    const id = req.query.id;
    if (!isValidCardId(id)) return sendError(res, 404, 'NOT_FOUND', 'Kartu tidak ditemukan.');

    const body = readJsonBody(req, res);
    if (!body) return;
    const action = body.action;
    if (action !== 'deactivate' && action !== 'activate') {
      return sendError(res, 400, 'VALIDATION', 'Aksi tidak valid.');
    }

    const card = await redis.get(KEYS.card(id));
    if (!card) return sendError(res, 404, 'NOT_FOUND', 'Kartu tidak terdaftar.');

    let next;
    if (action === 'deactivate') {
      if (card.status !== 'active') return sendError(res, 409, 'INVALID_TRANSITION', 'Hanya kartu aktif yang bisa dinonaktifkan.');
      next = 'inactive';
    } else {
      if (card.status !== 'inactive') return sendError(res, 409, 'INVALID_TRANSITION', 'Hanya kartu nonaktif yang bisa diaktifkan kembali.');
      next = 'active';
    }

    const updated = { ...card, status: next, updatedAt: new Date().toISOString() };
    await redis.set(KEYS.card(id), updated);
    return sendJson(res, 200, { ok: true, card: updated });
  } catch (err) {
    return handleError(res, err, 'admin/cards/[id]/status');
  }
}
