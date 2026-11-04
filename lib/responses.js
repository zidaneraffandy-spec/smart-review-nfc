// Format respons dan penanganan error yang seragam.

export const MAX_BODY_BYTES = 10 * 1024; // 10 KB

export function sendJson(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(payload);
}

export function sendError(res, status, code, message, fields) {
  sendJson(res, status, {
    ok: false,
    error: { code, message, ...(fields ? { fields } : {}) },
  });
}

export function allowMethods(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', '));
  sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Metode tidak diizinkan.');
  return false;
}

// Membaca body JSON dengan batas ukuran. Mengembalikan null jika gagal
// (respons error sudah dikirim, jadi pemanggil cukup `return`).
export function readJsonBody(req, res) {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_BODY_BYTES) {
    sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Data yang dikirim terlalu besar.');
    return null;
  }
  const type = String(req.headers['content-type'] || '');
  if (!type.includes('application/json')) {
    sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Gunakan Content-Type application/json.');
    return null;
  }
  let body;
  try {
    body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);
  } catch {
    sendError(res, 400, 'INVALID_JSON', 'Format data tidak valid.');
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    sendError(res, 400, 'INVALID_JSON', 'Format data tidak valid.');
    return null;
  }
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) {
    sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Data yang dikirim terlalu besar.');
    return null;
  }
  return body;
}

function isStorageFailure(err) {
  const name = String(err?.name || '');
  const msg = String(err?.message || '');
  return (
    name.includes('Upstash') ||
    msg === 'REDIS_NOT_CONFIGURED' ||
    /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT/i.test(msg)
  );
}

// Detail error hanya masuk log server (tanpa token). Pengguna lihat pesan generik.
export function handleError(res, err, context) {
  console.error(`[${context}]`, err?.name, err?.message);
  if (isStorageFailure(err)) {
    return sendError(res, 503, 'STORAGE_UNAVAILABLE', 'Layanan penyimpanan sedang bermasalah. Coba lagi nanti.');
  }
  return sendError(res, 500, 'INTERNAL_ERROR', 'Terjadi kesalahan pada server.');
}
