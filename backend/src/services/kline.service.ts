import { db } from '../database/sqlite.js';
import { BinanceAdapter } from '../exchanges/binance.js';
import { OKXAdapter } from '../exchanges/okx.js';
import type { Kline } from '../types/index.js';
import type { ExchangeAdapter } from '../types/index.js';

export class KlineService {
  private adapters: Map<string, ExchangeAdapter>;

  constructor(adapters?: Map<string, ExchangeAdapter>) {
    this.adapters = adapters ?? new Map<string, ExchangeAdapter>([
      ['binance', new BinanceAdapter()],
      ['okx', new OKXAdapter()],
    ]);
  }

  // 获取 K 线数据（数据库优先，不足则从交易所拉取）
  async getKlines(
    exchange: string,
    symbol: string,
    interval: string,
    limit: number = 1000
  ): Promise<Kline[]> {
    // 1. 查询数据库
    const cached = await db.getKlines(exchange, symbol, interval, limit);
    
    if (cached && cached.length >= limit) {
      // 数据库数据足够，直接返回
      return cached;
    }

    // 2. 数据库数据不足，从交易所拉取
    console.log(`数据库数据不足 (${cached?.length || 0}/${limit})，从 ${exchange} 拉取...`);
    
    try {
      const adapter = this.adapters.get(exchange);

      if (!adapter) {
        console.warn(`未找到交易所适配器：${exchange}`);
        return cached || [];
      }

      const remoteKlines = await adapter.getKlines(symbol, interval, limit);

      if (remoteKlines.length > 0) {
        await this.saveKlines(remoteKlines);
        return remoteKlines;
      }

      return cached || [];
    } catch (error: any) {
      console.error('从交易所拉取 K 线失败:', error.message);
      return cached || [];
    }
  }

  // 保存 K 线数据
  async saveKline(kline: Kline): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      db.saveKline(kline, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  // 批量保存 K 线数据
  async saveKlines(klines: Kline[]): Promise<void> {
    if (klines.length === 0) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      db.saveKlines(klines, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  // 获取支持的交易所
  getExchanges(): string[] {
    return ['binance', 'okx'];
  }

  // 获取支持的交易对
  async getSymbols(exchange?: string, type?: string): Promise<any[]> {
    return db.getSymbols(exchange, type);
  }
}

export const klineService = new KlineService();
