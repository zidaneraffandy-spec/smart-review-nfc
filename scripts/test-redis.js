import { getRedis } from '../lib/redis.js';

try {
  const redis = getRedis();
  await redis.set('healthcheck', 'ok', { ex: 30 });
  const value = await redis.get('healthcheck');
  console.log('Redis terhubung. Nilai uji:', value);
} catch (err) {
  console.error('Redis GAGAL terhubung:', err.message);
  process.exit(1);
}
