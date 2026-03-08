import { db } from '../database/sqlite.js';
import type { Kline } from '../types/index.js';

export class KlineService {
  // 获取 K 线数据（数据库优先，不足则从交易所拉取）
  async getKlines(
    exchange: string,
    symbol: string,
    interval: string,
    limit: number = 1000
  ): Promise<Kline[]> {
    // 1. 查询数据库
    const cached = db.getKlines(exchange, symbol, interval, limit);
    
    if (cached && cached.length >= limit) {
      // 数据库数据足够，直接返回
      return cached;
    }

    // 2. 数据库数据不足，从交易所拉取
    console.log(`数据库数据不足 (${cached?.length || 0}/${limit})，从 ${exchange} 拉取...`);
    
    try {
      // 这里会由 ExchangeManager 提供实际的交易所适配器
      // 暂时返回缓存数据，实际使用时会通过 manager 调用交易所
      return cached || [];
    } catch (error: any) {
      console.error('从交易所拉取 K 线失败:', error.message);
      return cached || [];
    }
  }

  // 保存 K 线数据
  async saveKline(kline: Kline): Promise<void> {
    db.saveKline(kline);
  }

  // 批量保存 K 线数据
  async saveKlines(klines: Kline[]): Promise<void> {
    db.saveKlines(klines);
  }

  // 获取支持的交易所
  getExchanges(): string[] {
    return ['binance', 'okx'];
  }

  // 获取支持的交易对
  getSymbols(exchange?: string, type?: string): any[] {
    return db.getSymbols(exchange, type);
  }
}

export const klineService = new KlineService();
