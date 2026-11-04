import { randomInt } from 'node:crypto';

// Tanpa huruf/angka yang mudah tertukar (I, O, 0, 1).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CARD_ID_REGEX = /^KARTU\d{3,7}-[A-HJ-NP-Z2-9]{6}$/;

export function generateCardId(seq) {
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += ALPHABET[randomInt(ALPHABET.length)];
  return `KARTU${String(seq).padStart(3, '0')}-${suffix}`;
}

export function isValidCardId(id) {
  return typeof id === 'string' && CARD_ID_REGEX.test(id);
}

export function createPendingCard(id) {
  const now = new Date().toISOString();
  return {
    id,
    status: 'pending',
    name: '',
    description: '',
    reviewUrl: '',
    whatsapp: '',
    color: '#2563eb',
    createdAt: now,
    activatedAt: null,
    updatedAt: now,
  };
}

// Daftar field PUBLIK ditulis eksplisit supaya field internal tidak bisa bocor.
export function toPublicCard(card) {
  return {
    name: card.name,
    description: card.description,
    reviewUrl: card.reviewUrl,
    whatsapp: card.whatsapp,
    color: card.color,
  };
}
