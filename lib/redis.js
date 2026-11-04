import { Redis } from '@upstash/redis';

let client;

// Dibuat sekali lalu dipakai ulang agar efisien di serverless.
export function getRedis() {
  if (!client) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error('REDIS_NOT_CONFIGURED');
    }
    client = new Redis({ url, token });
  }
  return client;
}

// Hanya dipakai oleh scripts/run-tests.js untuk menyuntik Redis palsu.
export function setRedisForTesting(fake) {
  client = fake;
}

// Semua nama key ada di sini supaya tidak salah ketik di file lain.
export const KEYS = {
  card: (id) => `card:${id}`,
  cardIndex: 'cards:index',
  cardSeq: 'cards:seq',
  session: (sid) => `session:${sid}`,
  rlLogin: (ip) => `rl:login:${ip}`,
  rlPublic: (ip) => `rl:pub:${ip}`,
  rlAdmin: (sid) => `rl:adm:${sid}`,
};
