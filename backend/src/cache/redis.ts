import { createClient, type RedisClientType } from 'redis';
import type { Kline } from '../types/index.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const KLINE_HOT_CACHE_TTL = 1800;
const KLINE_COLD_CACHE_TTL = 7200;
const KLINE_CACHE_PREFIX = 'kline:';
const KLINE_HOT_LIMIT = 1000;

export class RedisCache {
  private client: RedisClientType | null = null;
  private connected = false;

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      this.client = createClient({ url: REDIS_URL });
      this.client.on('error', (err) => {
        console.warn('Redis error:', err.message);
        this.connected = false;
      });
      await this.client.connect();
      this.connected = true;
      console.log('Redis connected');
    } catch (error: any) {
      console.warn('Redis unavailable:', error.message);
      this.client = null;
      this.connected = false;
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
      const hotKey = `${key}:hot`;

      const hotData = await this.client.get(hotKey);
      if (hotData) {
        const hotKlines = JSON.parse(hotData) as Kline[];
        if (hotKlines.length >= limit) {
          return hotKlines.slice(-limit);
        }

        const coldData = await this.client.get(key);
        if (coldData) {
          const coldKlines = JSON.parse(coldData) as Kline[];
          const merged = [...coldKlines, ...hotKlines];
          return merged.slice(-limit);
        }

        return hotKlines.slice(-limit);
      }

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
      const hotKey = `${key}:hot`;

      const latest500 = klines.slice(-KLINE_HOT_LIMIT);
      await this.client.setEx(hotKey, KLINE_HOT_CACHE_TTL, JSON.stringify(latest500));

      if (klines.length > KLINE_HOT_LIMIT) {
        const cold = klines.slice(0, -KLINE_HOT_LIMIT);
        await this.client.setEx(key, KLINE_COLD_CACHE_TTL, JSON.stringify(cold));
      }
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
