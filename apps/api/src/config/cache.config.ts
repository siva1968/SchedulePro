export const cacheConfig = () => ({
  cache: {
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    ttl: parseInt(process.env.CACHE_TTL || '300', 10), // 5 minutes
  },
});
