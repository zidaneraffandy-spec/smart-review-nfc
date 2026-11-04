// Validasi input di backend. Frontend hanya untuk kenyamanan, ini yang menentukan.

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanText(value) {
  if (typeof value !== 'string') return null;
  return value
    .normalize('NFC')
    .replace(CONTROL_CHARS, '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
}

// Mengembalikan nomor format internasional tanpa '+', mis. 628123456789, atau null.
export function normalizeWhatsapp(raw) {
  if (typeof raw !== 'string') return null;
  let d = raw.replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  if (!/^[1-9]\d{7,14}$/.test(d)) return null;
  return d;
}

const GOOGLE_HOSTS = ['g.page', 'g.co', 'goo.gl', 'maps.app.goo.gl', 'search.google.com'];
const GOOGLE_DOMAIN = /^(www\.|maps\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/;

// Mengembalikan URL ternormalisasi atau null. Hanya https ke domain Google.
export function normalizeReviewUrl(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s || s.length > 500) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== '443') return null;
  const host = u.hostname.toLowerCase();
  if (!GOOGLE_HOSTS.includes(host) && !GOOGLE_DOMAIN.test(host)) return null;
  return u.href;
}

export function normalizeColor(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}

// Validasi data toko untuk aktivasi dan edit.
export function validateCardFields(input) {
  const errors = {};
  const value = {};

  const name = cleanText(input.name);
  if (!name || name.length < 2 || name.length > 60) {
    errors.name = 'Nama UMKM wajib diisi (2-60 karakter).';
  } else value.name = name;

  const desc = input.description === undefined ? '' : cleanText(input.description);
  if (desc === null || desc.length > 160) {
    errors.description = 'Deskripsi maksimal 160 karakter.';
  } else value.description = desc;

  const reviewUrl = normalizeReviewUrl(input.reviewUrl);
  if (!reviewUrl) {
    errors.reviewUrl = 'Link Google Review harus diawali https:// dan berasal dari Google (mis. g.page atau google.com).';
  } else value.reviewUrl = reviewUrl;

  const wa = normalizeWhatsapp(input.whatsapp);
  if (!wa) {
    errors.whatsapp = 'Nomor WhatsApp tidak valid. Contoh: 081234567890 atau 6281234567890.';
  } else value.whatsapp = wa;

  const color = normalizeColor(input.color);
  if (!color) {
    errors.color = 'Warna harus format hex, mis. #2563eb.';
  } else value.color = color;

  return { ok: Object.keys(errors).length === 0, errors, value };
}
