// Pembatasan request berbasis Redis (counter + expire).

export function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return String(req.headers['x-real-ip'] || 'unknown');
}

// Menambah counter lalu mengecek batas. Window ikut diperpanjang setiap request,
// sehingga key tidak mungkin tersangkut selamanya.
export async function rateLimit(redis, key, max, windowSec) {
  const p = redis.pipeline();
  p.incr(key);
  p.expire(key, windowSec);
  const [count] = await p.exec();
  return { ok: Number(count) <= max, count: Number(count) };
}

export async function isBlocked(redis, key, max) {
  const count = Number(await redis.get(key)) || 0;
  return count >= max;
}

export async function addFailure(redis, key, windowSec) {
  const p = redis.pipeline();
  p.incr(key);
  p.expire(key, windowSec);
  await p.exec();
}
