// Tes otomatis TANPA Upstash (memakai Redis palsu di memori). Jalankan: npm test
import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';

process.env.VERCEL_ENV = 'development';
process.env.ADMIN_USERNAME = 'admin';
const salt = randomBytes(16).toString('hex');
process.env.ADMIN_PASSWORD_HASH = `scrypt:${salt}:${scryptSync('passwordtest123', salt, 64).toString('hex')}`;
process.env.SESSION_TTL_SECONDS = '3600';

const { setRedisForTesting } = await import('../lib/redis.js');
const { normalizeWhatsapp, normalizeReviewUrl, normalizeColor } = await import('../lib/validation.js');
const { isValidCardId } = await import('../lib/cards.js');
const { buildWhatsAppMessage, buildWhatsAppUrl, parseCardIdFromPath } = await import('../public/js/wa.js');
const publicCard = (await import('../api/public/card.js')).default;
const login = (await import('../api/auth/login.js')).default;
const logout = (await import('../api/auth/logout.js')).default;
const me = (await import('../api/auth/me.js')).default;
const cardsIndex = (await import('../api/admin/cards/index.js')).default;
const cardDetail = (await import('../api/admin/cards/[id]/index.js')).default;
const cardStatus = (await import('../api/admin/cards/[id]/status.js')).default;

// ---------- Redis palsu ----------
class FakeRedis {
  constructor() { this.data = new Map(); this.sets = new Map(); }
  async get(k) { return this.data.has(k) ? JSON.parse(this.data.get(k)) : null; }
  async set(k, v, o = {}) {
    if (o.nx && this.data.has(k)) return null;
    this.data.set(k, JSON.stringify(v)); return 'OK';
  }
  async del(k) { return this.data.delete(k) ? 1 : 0; }
  async incr(k) { const n = (Number(await this.get(k)) || 0) + 1; this.data.set(k, JSON.stringify(n)); return n; }
  async incrby(k, by) { const n = (Number(await this.get(k)) || 0) + by; this.data.set(k, JSON.stringify(n)); return n; }
  async expire() { return 1; }
  async sadd(k, m) { if (!this.sets.has(k)) this.sets.set(k, new Set()); this.sets.get(k).add(m); return 1; }
  async smembers(k) { return [...(this.sets.get(k) || [])]; }
  async mget(...keys) { return Promise.all(keys.map((k) => this.get(k))); }
  pipeline() {
    const ops = [];
    const p = new Proxy({}, {
      get: (_, name) => name === 'exec'
        ? () => Promise.all(ops.map((f) => f()))
        : (...args) => { ops.push(() => this[name](...args)); return p; },
    });
    return p;
  }
}
const fake = new FakeRedis();
setRedisForTesting(fake);

// ---------- Helper request ----------
function mockRes() {
  return {
    statusCode: 200, headers: {}, body: null,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    json(b) { this.body = b; return this; },
  };
}
async function call(handler, { method = 'GET', headers = {}, query = {}, body } = {}) {
  const h = { host: 'localhost:3000', 'x-forwarded-for': '3.3.3.3', ...headers };
  const req = { method, headers: h, query };
  if (body !== undefined) {
    req.body = body;
    h['content-type'] = 'application/json';
    h['content-length'] = String(Buffer.byteLength(JSON.stringify(body)));
  }
  const res = mockRes();
  await handler(req, res);
  return res;
}
async function doLogin(ip = '2.2.2.2') {
  const res = await call(login, {
    method: 'POST', headers: { origin: 'http://localhost:3000', 'x-forwarded-for': ip },
    body: { username: 'admin', password: 'passwordtest123' },
  });
  const sid = res.headers['set-cookie'].split(';')[0].split('=')[1];
  return { res, auth: { cookie: `sid=${sid}`, 'x-csrf-token': res.body.csrfToken, origin: 'http://localhost:3000' } };
}

const goodData = {
  name: 'Warung Bu Sari', description: 'Kopi dan roti bakar', color: '#e11d48',
  reviewUrl: 'https://g.page/r/ABC123/review', whatsapp: '0812-3456-7890',
};

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

// ---------- Tes ----------
console.log('\nValidasi');
await test('nomor WhatsApp dinormalisasi', () => {
  assert.equal(normalizeWhatsapp('081234567890'), '6281234567890');
  assert.equal(normalizeWhatsapp('+62 812-3456-7890'), '6281234567890');
  assert.equal(normalizeWhatsapp('abc'), null);
  assert.equal(normalizeWhatsapp('123'), null);
});
await test('URL Google Review: hanya https + domain Google', () => {
  assert.ok(normalizeReviewUrl('https://g.page/r/ABC/review'));
  assert.ok(normalizeReviewUrl('https://search.google.com/local/writereview?placeid=X'));
  assert.equal(normalizeReviewUrl('http://g.page/r/ABC'), null);
  assert.equal(normalizeReviewUrl('https://evil.com/g.page'), null);
  assert.equal(normalizeReviewUrl('https://g.page.evil.com/x'), null);
  assert.equal(normalizeReviewUrl('javascript:alert(1)'), null);
  assert.equal(normalizeReviewUrl('https://user:pw@g.page/x'), null);
});
await test('warna hex', () => {
  assert.equal(normalizeColor('#AABBCC'), '#aabbcc');
  assert.equal(normalizeColor('red'), null);
});
await test('format ID kartu', () => {
  assert.ok(isValidCardId('KARTU001-K7M2QX'));
  assert.ok(!isValidCardId('KARTU001'));
  assert.ok(!isValidCardId('../etc/passwd'));
});

console.log('\nAuth');
await test('1. admin berhasil login (cookie HttpOnly + SameSite=Strict)', async () => {
  const { res } = await doLogin();
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['set-cookie'], /HttpOnly/);
  assert.match(res.headers['set-cookie'], /SameSite=Strict/);
  assert.ok(res.body.csrfToken.length > 20);
});
await test('2. admin gagal login (password salah)', async () => {
  const res = await call(login, {
    method: 'POST', headers: { origin: 'http://localhost:3000', 'x-forwarded-for': '1.1.1.1' },
    body: { username: 'admin', password: 'salahsalah' },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['set-cookie'], undefined);
});
await test('login diblokir setelah 5 kali gagal', async () => {
  const attempt = (pw) => call(login, {
    method: 'POST', headers: { origin: 'http://localhost:3000', 'x-forwarded-for': '9.9.9.9' },
    body: { username: 'admin', password: pw },
  });
  for (let i = 0; i < 5; i++) assert.equal((await attempt('salahsalah')).statusCode, 401);
  assert.equal((await attempt('passwordtest123')).statusCode, 429);
});
await test('login ditolak jika Origin tidak cocok', async () => {
  const res = await call(login, {
    method: 'POST', headers: { origin: 'https://evil.com' },
    body: { username: 'admin', password: 'passwordtest123' },
  });
  assert.equal(res.statusCode, 403);
});

console.log('\nKartu');
const { auth } = await doLogin();
let ids = [];

await test('3. admin mendaftarkan ID kartu baru', async () => {
  const res = await call(cardsIndex, { method: 'POST', headers: auth, body: { jumlah: 3 } });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.cards.length, 3);
  ids = res.body.cards.map((c) => c.id);
  assert.ok(ids.every(isValidCardId));
  assert.ok(res.body.cards.every((c) => c.status === 'pending'));
});
await test('jumlah ID di luar 1-50 ditolak', async () => {
  assert.equal((await call(cardsIndex, { method: 'POST', headers: auth, body: { jumlah: 51 } })).statusCode, 400);
});
await test('6. kartu pending tidak dapat digunakan (tanpa data toko)', async () => {
  const res = await call(publicCard, { query: { id: ids[0] } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.status, 'pending');
  assert.equal(res.body.card, undefined);
});
await test('8. ID tidak dikenal ditolak dan TIDAK membuat kartu baru', async () => {
  const before = (await fake.smembers('cards:index')).length;
  const a = await call(publicCard, { query: { id: 'KARTU999-ABCDEF' } });
  const b = await call(publicCard, { query: { id: 'asal-asalan' } });
  assert.equal(a.statusCode, 404);
  assert.equal(b.statusCode, 404);
  assert.equal((await fake.smembers('cards:index')).length, before);
});
await test('aktivasi dengan data tidak valid ditolak (400 + detail field)', async () => {
  const res = await call(cardDetail, {
    method: 'PUT', headers: auth, query: { id: ids[0] },
    body: { ...goodData, mode: 'activate', reviewUrl: 'https://evil.com/x', whatsapp: 'abc' },
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error.fields.reviewUrl);
  assert.ok(res.body.error.fields.whatsapp);
  assert.equal((await call(publicCard, { query: { id: ids[0] } })).body.status, 'pending');
});
await test('4. admin mengaktifkan kartu', async () => {
  const res = await call(cardDetail, {
    method: 'PUT', headers: auth, query: { id: ids[0] }, body: { ...goodData, mode: 'activate' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.card.status, 'active');
  assert.equal(res.body.card.whatsapp, '6281234567890');
});
await test('mengaktifkan kartu yang sudah aktif ditolak (409)', async () => {
  const res = await call(cardDetail, {
    method: 'PUT', headers: auth, query: { id: ids[0] }, body: { ...goodData, mode: 'activate' },
  });
  assert.equal(res.statusCode, 409);
});
await test('5. kartu aktif menampilkan data publik (tanpa field internal)', async () => {
  const res = await call(publicCard, { query: { id: ids[0] } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.card.name, 'Warung Bu Sari');
  assert.deepEqual(Object.keys(res.body.card).sort(), ['color', 'description', 'name', 'reviewUrl', 'whatsapp']);
});
await test('9/10/11. ubah WhatsApp & link review, halaman langsung memakai data terbaru', async () => {
  const res = await call(cardDetail, {
    method: 'PUT', headers: auth, query: { id: ids[0] },
    body: { ...goodData, mode: 'edit', whatsapp: '6285599998888', reviewUrl: 'https://g.page/r/BARU/review' },
  });
  assert.equal(res.statusCode, 200);
  const pub = await call(publicCard, { query: { id: ids[0] } });
  assert.equal(pub.body.card.whatsapp, '6285599998888');
  assert.equal(pub.body.card.reviewUrl, 'https://g.page/r/BARU/review');
  assert.equal(pub.headers['cache-control'], 'no-store');
});
await test('7. kartu inactive tidak dapat digunakan', async () => {
  const off = await call(cardStatus, { method: 'POST', headers: auth, query: { id: ids[0] }, body: { action: 'deactivate' } });
  assert.equal(off.statusCode, 200);
  const pub = await call(publicCard, { query: { id: ids[0] } });
  assert.equal(pub.statusCode, 403);
  assert.equal(pub.body.status, 'inactive');
  assert.equal(pub.body.card, undefined);
});
await test('kartu nonaktif bisa diaktifkan kembali; pending tidak bisa diubah statusnya', async () => {
  const on = await call(cardStatus, { method: 'POST', headers: auth, query: { id: ids[0] }, body: { action: 'activate' } });
  assert.equal(on.body.card.status, 'active');
  const bad = await call(cardStatus, { method: 'POST', headers: auth, query: { id: ids[1] }, body: { action: 'activate' } });
  assert.equal(bad.statusCode, 409);
});
await test('daftar kartu: statistik, pencarian, filter', async () => {
  const all = await call(cardsIndex, { headers: auth });
  assert.deepEqual(all.body.stats, { total: 3, pending: 2, active: 1, inactive: 0 });
  const byName = await call(cardsIndex, { headers: auth, query: { q: 'bu sari' } });
  assert.equal(byName.body.cards.length, 1);
  const pend = await call(cardsIndex, { headers: auth, query: { status: 'pending' } });
  assert.equal(pend.body.cards.length, 2);
});

console.log('\nKeamanan');
await test('12. tanpa login tidak dapat membaca/mengubah data', async () => {
  assert.equal((await call(cardsIndex)).statusCode, 401);
  assert.equal((await call(cardsIndex, { method: 'POST', body: { jumlah: 1 } })).statusCode, 401);
  assert.equal((await call(cardDetail, { method: 'PUT', query: { id: ids[0] }, body: { ...goodData, mode: 'edit' } })).statusCode, 401);
  assert.equal((await call(cardStatus, { method: 'POST', query: { id: ids[0] }, body: { action: 'deactivate' } })).statusCode, 401);
  assert.equal((await call(me)).statusCode, 401);
});
await test('login tanpa token CSRF / Origin salah ditolak (403)', async () => {
  const noCsrf = { cookie: auth.cookie, origin: auth.origin };
  const badOrigin = { ...auth, origin: 'https://evil.com' };
  const noOrigin = { cookie: auth.cookie, 'x-csrf-token': auth['x-csrf-token'] };
  for (const h of [noCsrf, badOrigin, noOrigin]) {
    const r = await call(cardStatus, { method: 'POST', headers: h, query: { id: ids[0] }, body: { action: 'deactivate' } });
    assert.equal(r.statusCode, 403);
  }
  assert.equal((await call(publicCard, { query: { id: ids[0] } })).body.status, 'active');
});
await test('body terlalu besar ditolak (413)', async () => {
  const res = await call(cardsIndex, { method: 'POST', headers: auth, body: { jumlah: 1, junk: 'x'.repeat(20000) } });
  assert.equal(res.statusCode, 413);
});
await test('logout menghapus sesi di server', async () => {
  const { auth: a2 } = await doLogin('4.4.4.4');
  assert.equal((await call(me, { headers: a2 })).statusCode, 200);
  assert.equal((await call(logout, { method: 'POST', headers: a2, body: {} })).statusCode, 200);
  assert.equal((await call(me, { headers: a2 })).statusCode, 401);
});

console.log('\nKegagalan Redis');
await test('13. Redis down → 503 dengan pesan generik', async () => {
  const broken = new Proxy({}, {
    get: () => () => { throw Object.assign(new Error('secret-token-xyz'), { name: 'UpstashError' }); },
  });
  setRedisForTesting(broken);
  const origError = console.error;
  console.error = () => {};
  try {
    const res = await call(publicCard, { query: { id: ids[0] } });
    assert.equal(res.statusCode, 503);
    assert.ok(!JSON.stringify(res.body).includes('secret-token-xyz'));
  } finally {
    console.error = origError;
    setRedisForTesting(fake);
  }
});

console.log('\nWhatsApp');
await test('14. pesan & tautan WhatsApp terbentuk dengan benar', () => {
  const msg = buildWhatsAppMessage({ storeName: 'Warung Bu Sari', rating: 2, feedback: 'Pelayanan lambat & kopi dingin' });
  assert.equal(msg, 'Masukan pelanggan untuk: Warung Bu Sari\nRating: 2/5\nKritik dan saran: Pelayanan lambat & kopi dingin');
  const url = buildWhatsAppUrl('6281234567890', msg);
  assert.ok(url.startsWith('https://wa.me/6281234567890?text='));
  assert.equal(decodeURIComponent(url.split('?text=')[1]), msg);
  assert.ok(!url.split('?text=')[1].includes('&'));
});
await test('ID kartu dibaca dari path URL', () => {
  assert.equal(parseCardIdFromPath('/c/KARTU001-K7M2QX'), 'KARTU001-K7M2QX');
  assert.equal(parseCardIdFromPath('/admin'), null);
});

console.log(`\nHasil: ${passed} lulus, ${failed} gagal`);
console.log('Catatan: tes 15 (layout HP & desktop) dilakukan manual di browser.\n');
process.exit(failed ? 1 : 0);
