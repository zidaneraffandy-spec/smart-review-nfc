const $ = (s, r = document) => r.querySelector(s);

let csrf = '';
let editing = null; // { card, mode }

class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields || null;
  }
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = csrf;
  let res;
  try {
    res = await fetch(path, {
      method, headers, credentials: 'same-origin', cache: 'no-store',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Tidak bisa terhubung ke server. Periksa internet Anda.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* abaikan */ }
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/login') showLogin();
    throw new ApiError(res.status, data?.error?.message || 'Terjadi kesalahan.', data?.error?.fields);
  }
  return data;
}

// ---------- Utilitas UI ----------
let toastTimer;
function toast(message, type = 'ok') {
  const el = $('#toast');
  el.textContent = message;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3500);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.className = 'offscreen';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* abaikan */ }
    ta.remove();
    return ok;
  }
}

const cardUrl = (id) => `${location.origin}/c/${id}`;
const STATUS_LABEL = { pending: 'Belum aktif', active: 'Aktif', inactive: 'Nonaktif' };

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(label, className, onClick) {
  const b = el('button', `btn small ${className || ''}`.trim(), label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

// ---------- Tampilan login / app ----------
function showLogin() {
  $('#view-app').hidden = true;
  $('#view-login').hidden = false;
  csrf = '';
}
function showApp() {
  $('#view-login').hidden = true;
  $('#view-app').hidden = false;
}

// ---------- Validasi frontend (kenyamanan; server tetap memvalidasi ulang) ----------
function validateForm(v) {
  const errors = {};
  if (v.name.trim().length < 2 || v.name.trim().length > 60) errors.name = 'Nama UMKM wajib diisi (2-60 karakter).';
  if (v.description.length > 160) errors.description = 'Deskripsi maksimal 160 karakter.';
  try {
    const u = new URL(v.reviewUrl.trim());
    if (u.protocol !== 'https:') throw new Error();
  } catch {
    errors.reviewUrl = 'Link harus diawali https://.';
  }
  const digits = v.whatsapp.replace(/[\s\-().+]/g, '');
  if (!/^\d{8,16}$/.test(digits)) errors.whatsapp = 'Nomor WhatsApp tidak valid.';
  if (!/^#[0-9a-fA-F]{6}$/.test(v.color)) errors.color = 'Warna tidak valid.';
  return errors;
}

function showFieldErrors(errors) {
  document.querySelectorAll('#card-form [data-err]').forEach((s) => {
    s.textContent = errors[s.dataset.err] || '';
  });
}

// ---------- Daftar kartu ----------
async function loadCards() {
  const q = $('#search').value.trim();
  const status = $('#filter').value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (status) params.set('status', status);
  try {
    const data = await api(`/api/admin/cards?${params}`);
    $('#st-total').textContent = data.stats.total;
    $('#st-active').textContent = data.stats.active;
    $('#st-pending').textContent = data.stats.pending;
    $('#st-inactive').textContent = data.stats.inactive;
    renderList(data.cards, data.stats.total);
  } catch (err) {
    if (err.status !== 401) toast(err.message, 'err');
  }
}

function renderList(cards, total) {
  const list = $('#card-list');
  list.replaceChildren();
  $('#empty').hidden = cards.length > 0;
  $('#empty').textContent = total === 0
    ? 'Belum ada kartu. Tekan "Daftarkan ID" untuk membuat ID kartu baru.'
    : 'Tidak ada kartu yang cocok.';

  for (const card of cards) {
    const li = el('li', 'item');
    const head = el('div', 'item-head');
    head.append(el('code', '', card.id), el('span', `badge ${card.status}`, STATUS_LABEL[card.status] || card.status));
    li.append(head, el('p', 'item-name', card.name || '(belum ada nama toko)'));

    const actions = el('div', 'row');
    if (card.status === 'pending') {
      actions.append(button('Aktivasi', 'primary', () => openCardDialog(card, 'activate')));
    } else {
      actions.append(button('Edit', '', () => openCardDialog(card, 'edit')));
      if (card.status === 'active') {
        actions.append(button('Nonaktifkan', 'danger', () => changeStatus(card, 'deactivate')));
      } else {
        actions.append(button('Aktifkan kembali', 'primary', () => changeStatus(card, 'activate')));
      }
    }
    actions.append(button('Salin URL', '', async () => {
      toast((await copyText(cardUrl(card.id))) ? 'URL kartu disalin.' : 'Gagal menyalin URL.', 'ok');
    }));
    const open = el('a', 'btn small', 'Buka');
    open.href = cardUrl(card.id);
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    actions.append(open);

    li.append(actions);
    list.append(li);
  }
}

async function changeStatus(card, action) {
  const label = action === 'deactivate' ? 'menonaktifkan' : 'mengaktifkan kembali';
  if (!confirm(`Yakin ingin ${label} kartu ${card.name || card.id}?`)) return;
  try {
    await api(`/api/admin/cards/${encodeURIComponent(card.id)}/status`, { method: 'POST', body: { action } });
    toast(action === 'deactivate' ? 'Kartu dinonaktifkan.' : 'Kartu diaktifkan kembali.');
    loadCards();
  } catch (err) {
    toast(err.message, 'err');
  }
}

// ---------- Dialog aktivasi / edit ----------
function openCardDialog(card, mode) {
  editing = { card, mode };
  $('#card-title').textContent = mode === 'activate' ? 'Aktivasi kartu' : 'Edit data toko';
  $('#f-id').textContent = card.id;
  const st = $('#f-status');
  st.textContent = STATUS_LABEL[card.status];
  st.className = `badge ${card.status}`;
  $('#f-name').value = card.name || '';
  $('#f-desc').value = card.description || '';
  $('#f-review').value = card.reviewUrl || '';
  $('#f-wa').value = card.whatsapp || '';
  $('#f-color').value = card.color || '#2563eb';
  $('#card-save').textContent = mode === 'activate' ? 'Aktifkan' : 'Simpan perubahan';
  $('#card-save').disabled = false;
  $('#card-done').hidden = true;
  showFieldErrors({});
  $('#dlg-card').showModal();
}

$('#card-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!editing) return;
  const v = {
    mode: editing.mode,
    name: $('#f-name').value,
    description: $('#f-desc').value,
    reviewUrl: $('#f-review').value,
    whatsapp: $('#f-wa').value,
    color: $('#f-color').value,
  };
  const errors = validateForm(v);
  showFieldErrors(errors);
  if (Object.keys(errors).length) { toast('Periksa kembali isian Anda.', 'err'); return; }

  const btn = $('#card-save');
  btn.disabled = true;
  try {
    const data = await api(`/api/admin/cards/${encodeURIComponent(editing.card.id)}`, { method: 'PUT', body: v });
    const saved = data.card;
    editing = { card: saved, mode: 'edit' };
    toast(v.mode === 'activate' ? 'Kartu berhasil diaktifkan.' : 'Perubahan berhasil disimpan.');
    $('#f-status').textContent = STATUS_LABEL[saved.status];
    $('#f-status').className = `badge ${saved.status}`;
    $('#card-done-text').textContent = 'Tersimpan. Halaman pelanggan sudah memakai data terbaru.';
    $('#done-open').href = cardUrl(saved.id);
    $('#card-done').hidden = false;
    $('#card-save').textContent = 'Simpan perubahan';
    loadCards();
  } catch (err) {
    if (err.fields) showFieldErrors(err.fields);
    toast(err.message, 'err');
  } finally {
    btn.disabled = false;
  }
});

$('#done-copy').addEventListener('click', async () => {
  toast((await copyText(cardUrl(editing.card.id))) ? 'URL kartu disalin.' : 'Gagal menyalin URL.');
});
$('#card-cancel').addEventListener('click', () => $('#dlg-card').close());

// ---------- Dialog daftarkan ID ----------
$('#btn-register').addEventListener('click', () => {
  $('#reg-result').hidden = true;
  $('#reg-urls').value = '';
  $('#r-count').value = 1;
  $('#dlg-register').showModal();
});
$('#reg-cancel').addEventListener('click', () => $('#dlg-register').close());

$('#register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = Number($('#r-count').value);
  if (!Number.isInteger(n) || n < 1 || n > 50) { toast('Jumlah harus 1-50.', 'err'); return; }
  const btn = $('#reg-submit');
  btn.disabled = true;
  try {
    const data = await api('/api/admin/cards', { method: 'POST', body: { jumlah: n } });
    $('#reg-urls').value = data.cards.map((c) => cardUrl(c.id)).join('\n');
    $('#reg-result').hidden = false;
    toast(`${data.cards.length} ID kartu berhasil dibuat.`);
    loadCards();
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false;
  }
});
$('#reg-copy').addEventListener('click', async () => {
  toast((await copyText($('#reg-urls').value)) ? 'Semua URL disalin.' : 'Gagal menyalin.');
});

// ---------- Cari & filter ----------
let searchTimer;
$('#search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadCards, 250); });
$('#filter').addEventListener('change', loadCards);

// ---------- Login / logout ----------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-error');
  err.hidden = true;
  $('#btn-login').disabled = true;
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: { username: $('#l-user').value, password: $('#l-pass').value },
    });
    csrf = data.csrfToken;
    $('#l-pass').value = '';
    showApp();
    loadCards();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    $('#btn-login').disabled = false;
  }
});

$('#btn-logout').addEventListener('click', async () => {
  try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch { /* tetap keluar */ }
  showLogin();
  toast('Anda sudah keluar.');
});

// ---------- Mulai ----------
(async function init() {
  try {
    const me = await api('/api/auth/me');
    csrf = me.csrfToken;
    showApp();
    loadCards();
  } catch {
    showLogin();
  }
})();
