// Fungsi murni (tanpa DOM) agar bisa diuji di Node dan dipakai di browser.

export function parseCardIdFromPath(pathname) {
  const m = /^\/c\/([^/]+)\/?$/.exec(pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

export function buildWhatsAppMessage({ storeName, rating, feedback }) {
  return [
    `Masukan pelanggan untuk: ${storeName}`,
    `Rating: ${rating}/5`,
    `Kritik dan saran: ${feedback}`,
  ].join('\n');
}

export function buildWhatsAppUrl(number, message) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

// Hitung warna teks (putih/hitam) yang terbaca di atas warna utama.
export function readableTextColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#111827' : '#ffffff';
}
