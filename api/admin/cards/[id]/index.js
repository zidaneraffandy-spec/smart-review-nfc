// GET /api/admin/cards/:id  -> detail
// PUT /api/admin/cards/:id  -> { mode: 'activate' | 'edit', name, description, reviewUrl, whatsapp, color }
import { getRedis, KEYS } from '../../../../lib/redis.js';
import { allowMethods, readJsonBody, sendJson, sendError, handleError } from '../../../../lib/responses.js';
import { requireAuth } from '../../../../lib/auth.js';
import { isValidCardId } from '../../../../lib/cards.js';
import { validateCardFields } from '../../../../lib/validation.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'PUT'])) return;
  try {
    const redis = getRedis();
    const auth = await requireAuth(req, res, redis, { write: req.method === 'PUT' });
    if (!auth) return;

    const id = req.query.id;
    if (!isValidCardId(id)) return sendError(res, 404, 'NOT_FOUND', 'Kartu tidak ditemukan.');

    const card = await redis.get(KEYS.card(id));
    if (!card) return sendError(res, 404, 'NOT_FOUND', 'Kartu tidak terdaftar.');

    if (req.method === 'GET') return sendJson(res, 200, { ok: true, card });

    const body = readJsonBody(req, res);
    if (!body) return;

    const mode = body.mode;
    if (mode !== 'activate' && mode !== 'edit') {
      return sendError(res, 400, 'VALIDATION', 'Mode harus "activate" atau "edit".');
    }
    if (mode === 'activate' && card.status !== 'pending') {
      return sendError(res, 409, 'ALREADY_ACTIVATED', 'Kartu ini sudah pernah diaktivasi. Gunakan menu Edit.');
    }
    if (mode === 'edit' && card.status === 'pending') {
      return sendError(res, 409, 'NOT_ACTIVATED', 'Kartu ini belum diaktivasi.');
    }

    const v = validateCardFields(body);
    if (!v.ok) {
      return sendError(res, 400, 'VALIDATION', 'Data belum valid. Periksa kembali isian Anda.', v.errors);
    }

    const now = new Date().toISOString();
    const updated = {
      ...card,
      ...v.value, // hanya name, description, reviewUrl, whatsapp, color
      status: mode === 'activate' ? 'active' : card.status,
      activatedAt: mode === 'activate' ? now : card.activatedAt,
      updatedAt: now,
    };

    // Jika penyimpanan gagal, set() melempar error dan kartu TIDAK berubah.
    await redis.set(KEYS.card(id), updated);
    return sendJson(res, 200, { ok: true, card: updated });
  } catch (err) {
    return handleError(res, err, 'admin/cards/[id]');
  }
}
