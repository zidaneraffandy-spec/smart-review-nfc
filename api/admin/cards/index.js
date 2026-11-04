// GET  /api/admin/cards?q=&status=  -> daftar kartu + statistik
// POST /api/admin/cards             -> daftarkan ID baru { jumlah: 1-50 }
import { getRedis, KEYS } from '../../../lib/redis.js';
import { allowMethods, readJsonBody, sendJson, sendError, handleError } from '../../../lib/responses.js';
import { requireAuth } from '../../../lib/auth.js';
import { generateCardId, createPendingCard } from '../../../lib/cards.js';

const STATUSES = ['pending', 'active', 'inactive'];

async function listCards(req, res, redis) {
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 60);
  const status = String(req.query.status || '');
  if (status && !STATUSES.includes(status)) {
    return sendError(res, 400, 'VALIDATION', 'Filter status tidak valid.');
  }

  const ids = await redis.smembers(KEYS.cardIndex);
  let cards = [];
  if (ids.length) {
    ids.sort();
    const rows = await redis.mget(...ids.map((id) => KEYS.card(id)));
    cards = rows.filter(Boolean);
  }

  const stats = { total: cards.length, pending: 0, active: 0, inactive: 0 };
  for (const c of cards) if (stats[c.status] !== undefined) stats[c.status]++;

  if (status) cards = cards.filter((c) => c.status === status);
  if (q) {
    cards = cards.filter(
      (c) => c.id.toLowerCase().includes(q) || String(c.name || '').toLowerCase().includes(q)
    );
  }
  return sendJson(res, 200, { ok: true, stats, cards });
}

async function registerCards(req, res, redis) {
  const body = readJsonBody(req, res);
  if (!body) return;
  const n = Number(body.jumlah);
  if (!Number.isInteger(n) || n < 1 || n > 50) {
    return sendError(res, 400, 'VALIDATION', 'Jumlah harus bilangan bulat 1-50.');
  }

  const end = await redis.incrby(KEYS.cardSeq, n);
  const start = end - n + 1;
  const cards = [];
  const p = redis.pipeline();
  for (let i = start; i <= end; i++) {
    const card = createPendingCard(generateCardId(i));
    cards.push(card);
    p.set(KEYS.card(card.id), card, { nx: true }); // nx: tidak menimpa data yang ada
    p.sadd(KEYS.cardIndex, card.id);
  }
  await p.exec();
  return sendJson(res, 201, { ok: true, cards });
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  try {
    const redis = getRedis();
    const auth = await requireAuth(req, res, redis, { write: req.method === 'POST' });
    if (!auth) return;
    if (req.method === 'GET') return await listCards(req, res, redis);
    return await registerCards(req, res, redis);
  } catch (err) {
    return handleError(res, err, 'admin/cards');
  }
}
