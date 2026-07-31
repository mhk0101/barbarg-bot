import IORedis, { type Redis } from 'ioredis'

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6380'

let redis: Redis | null = null

export function getRedis(): Redis {
  if (!redis) {
    redis = new IORedis(redisUrl)
    redis.on('error', (err) => console.error('[Redis] Error:', err.message))
    redis.on('connect', () => console.log('[Redis] Connected'))
  }
  return redis
}

export async function closeRedis() {
  if (redis) { await redis.quit(); redis = null }
}

const parsed = new URL(redisUrl)
export const REDIS_CONFIG = { host: parsed.hostname, port: parseInt(parsed.port || '6380') }
