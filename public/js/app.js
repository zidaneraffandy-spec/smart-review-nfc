import { parseCardIdFromPath, buildWhatsAppMessage, buildWhatsAppUrl, readableTextColor } from './wa.js';

const $ = (id) => document.getElementById(id);

function show(stateId) {
  for (const id of ['state-loading', 'state-message', 'state-active']) $(id).hidden = id !== stateId;
}

function showMessage(title, text) {
  $('msg-title').textContent = title;
  $('msg-text').textContent = text;
  document.title = title;
  show('state-message');
}

async function loadCard(id) {
  let res;
  try {
    res = await fetch(`/api/public/card?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
  } catch {
    return { status: 'error' };
  }
  let data = null;
  try { data = await res.json(); } catch { /* abaikan */ }
  if (res.status === 429) return { status: 'busy' };
  if (data && data.status) return data;
  return { status: 'error' };
}

function setupActive(card) {
  const root = document.documentElement;
  root.style.setProperty('--brand', card.color);
  root.style.setProperty('--brand-ink', readableTextColor(card.color));

  document.title = `Ulasan untuk ${card.name}`;
  $('store-name').textContent = card.name;
  $('store-desc').textContent = card.description;
  $('store-desc').hidden = !card.description;
  $('btn-google').href = card.reviewUrl;
  $('skip-link').href = card.reviewUrl;

  let rating = 0;
  const stars = [...document.querySelectorAll('.star')];

  function paint() {
    stars.forEach((s) => {
      const v = Number(s.dataset.value);
      s.classList.toggle('on', v <= rating);
      s.setAttribute('aria-checked', String(v === rating));
    });
  }

  stars.forEach((s) =>
    s.addEventListener('click', () => {
      rating = Number(s.dataset.value);
      paint();
      $('after-rating').hidden = false;
      // Tombol Google Review tersedia untuk SEMUA rating.
      $('rating-text').textContent =
        rating >= 4
          ? 'Senang mendengarnya! Jika berkenan, bagikan pengalaman Anda secara jujur di Google.'
          : 'Terima kasih atas penilaiannya. Anda bebas menulis ulasan di Google, dan boleh juga menyampaikan masukan langsung kepada pemilik.';
      $('feedback-box').hidden = rating > 3;
      $('wa-note').hidden = true;
    })
  );

  $('btn-wa').addEventListener('click', () => {
    const feedback = $('feedback').value.replace(/\s+/g, ' ').trim();
    const err = $('feedback-error');
    if (!rating) { err.textContent = 'Pilih rating terlebih dahulu.'; err.hidden = false; return; }
    if (feedback.length < 3) { err.textContent = 'Tulis kritik atau saran Anda terlebih dahulu.'; err.hidden = false; return; }
    if (!/^\d{8,15}$/.test(card.whatsapp)) { err.textContent = 'Nomor WhatsApp toko belum tersedia.'; err.hidden = false; return; }
    err.hidden = true;

    const message = buildWhatsAppMessage({ storeName: card.name, rating, feedback });
    const url = buildWhatsAppUrl(card.whatsapp, message);
    const win = window.open(url, '_blank', 'noopener');
    if (!win) window.location.href = url;

    // Pesan BELUM terkirim: pelanggan harus menekan Kirim di WhatsApp.
    const note = $('wa-note');
    note.textContent = 'WhatsApp dibuka dengan pesan yang sudah terisi. Tekan tombol Kirim di WhatsApp untuk mengirimnya.';
    note.hidden = false;
  });

  show('state-active');
}

async function init() {
  const id = parseCardIdFromPath(window.location.pathname);
  if (!id) return showMessage('Halaman tidak ditemukan', 'Pastikan Anda memindai kartu yang benar.');

  const data = await loadCard(id);
  switch (data.status) {
    case 'active': return setupActive(data.card);
    case 'pending': return showMessage('Kartu belum aktif', 'Kartu ini belum diaktifkan. Silakan hubungi pemilik usaha.');
    case 'inactive': return showMessage('Kartu tidak aktif', 'Kartu ini sedang tidak digunakan.');
    case 'not_found': return showMessage('Kartu tidak ditemukan', 'Pastikan Anda memindai kartu yang benar.');
    case 'busy': return showMessage('Terlalu banyak permintaan', 'Coba lagi beberapa saat lagi.');
    default: return showMessage('Gagal memuat halaman', 'Periksa koneksi internet Anda lalu muat ulang halaman.');
  }
}

init();
