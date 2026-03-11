import { createClient, type RedisClientType } from 'redis';
import type { Kline } from '../types/index.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const KLINE_CACHE_TTL = 300;
const KLINE_CACHE_PREFIX = 'kline:';

export class RedisCache {
  private client: RedisClientType | null = null;
  private connected = false;

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      this.client = createClient({ url: REDIS_URL });
      this.client.on('error', (err) => console.warn('Redis error:', err.message));
      await this.client.connect();
      this.connected = true;
      console.log('Redis connected');
    } catch (error: any) {
      console.warn('Redis unavailable:', error.message);
      this.client = null;
    }
  }

  async getKlines(
    exchange: string,
    symbol: string,
    interval: string,
    limit: number,
  ): Promise<Kline[] | null> {
    if (!this.client) return null;

    try {
      const key = `${KLINE_CACHE_PREFIX}${exchange}:${symbol}:${interval}`;
      const data = await this.client.get(key);
      if (!data) return null;

      const klines = JSON.parse(data) as Kline[];
      return klines.slice(-limit);
    } catch (error: any) {
      console.warn('Redis get failed:', error.message);
      return null;
    }
  }

  async setKlines(
    exchange: string,
    symbol: string,
    interval: string,
    klines: Kline[],
  ): Promise<void> {
    if (!this.client) return;

    try {
      const key = `${KLINE_CACHE_PREFIX}${exchange}:${symbol}:${interval}`;
      const latest1000 = klines.slice(-1000);
      await this.client.setEx(key, KLINE_CACHE_TTL, JSON.stringify(latest1000));
    } catch (error: any) {
      console.warn('Redis set failed:', error.message);
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
    }
  }
}

export const redisCache = new RedisCache();
