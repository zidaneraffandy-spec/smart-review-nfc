import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { KEYS } from './redis.js';
import { sendError } from './responses.js';
import { rateLimit } from './ratelimit.js';

// Saat `vercel dev` (http://localhost) cookie Secure/__Host- tidak dipakai.
const isDev = () => process.env.VERCEL_ENV === 'development';
export const cookieName = () => (isDev() ? 'sid' : '__Host-sid');
export const sessionTtl = () => Number(process.env.SESSION_TTL_SECONDS) || 28800;

function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

// Format hash: scrypt:<salt>:<hashHex> (dibuat oleh scripts/hash-password.js)
export function verifyPassword(password, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  if (!expected.length) return false;
  const actual = scryptSync(password, parts[1], expected.length);
  return timingSafeEqual(actual, expected);
}

export function verifyCredentials(username, password) {
  const u = process.env.ADMIN_USERNAME;
  const h = process.env.ADMIN_PASSWORD_HASH;
  if (!u || !h) throw new Error('AUTH_NOT_CONFIGURED');
  // Kedua pemeriksaan selalu dijalankan agar waktu respons tidak membocorkan username.
  const userOk = safeEqual(username, u);
  const passOk = verifyPassword(password, h);
  return userOk && passOk;
}

export async function createSession(redis) {
  const sid = randomBytes(32).toString('hex');
  const csrf = randomBytes(24).toString('hex');
  await redis.set(
    KEYS.session(sid),
    { csrf, createdAt: new Date().toISOString() },
    { ex: sessionTtl() }
  );
  return { sid, csrf };
}

export function buildSessionCookie(sid, maxAge) {
  return [
    `${cookieName()}=${sid}`,
    'HttpOnly',
    ...(isDev() ? [] : ['Secure']),
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${maxAge}`,
  ].join('; ');
}

export function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// Header Origin harus sama dengan host kita (lapisan tambahan di atas SameSite).
export function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

// Mengembalikan { sid, session } atau null (respons error sudah dikirim).
// write=true berarti permintaan mengubah data: wajib CSRF + Origin + rate limit.
export async function requireAuth(req, res, redis, { write = false } = {}) {
  const sid = parseCookies(req)[cookieName()];
  if (!sid || !/^[a-f0-9]{64}$/.test(sid)) {
    sendError(res, 401, 'UNAUTHENTICATED', 'Silakan login terlebih dahulu.');
    return null;
  }
  const session = await redis.get(KEYS.session(sid));
  if (!session || !session.csrf) {
    sendError(res, 401, 'UNAUTHENTICATED', 'Sesi berakhir. Silakan login kembali.');
    return null;
  }
  if (write) {
    const token = req.headers['x-csrf-token'];
    if (!checkOrigin(req) || !token || !safeEqual(token, session.csrf)) {
      sendError(res, 403, 'FORBIDDEN', 'Permintaan ditolak.');
      return null;
    }
    const rl = await rateLimit(redis, KEYS.rlAdmin(sid), 60, 60);
    if (!rl.ok) {
      res.setHeader('Retry-After', '60');
      sendError(res, 429, 'RATE_LIMITED', 'Terlalu banyak permintaan. Coba lagi sebentar lagi.');
      return null;
    }
  }
  return { sid, session };
}
