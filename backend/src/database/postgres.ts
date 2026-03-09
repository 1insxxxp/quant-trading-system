import { Pool, type QueryResult } from 'pg';

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'quant_trading',
  user: process.env.DB_USER || 'quant_user',
  password: process.env.DB_PASSWORD || 'quant_pass_2026',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

export class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool(DB_CONFIG);
    this.init();
  }

  private async init() {
    try {
      // 创建 K 线数据表
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS klines (
          id SERIAL PRIMARY KEY,
          exchange TEXT NOT NULL,
          symbol TEXT NOT NULL,
          interval TEXT NOT NULL,
          open_time BIGINT NOT NULL,
          close_time BIGINT NOT NULL,
          open NUMERIC NOT NULL,
          high NUMERIC NOT NULL,
          low NUMERIC NOT NULL,
          close NUMERIC NOT NULL,
          volume NUMERIC NOT NULL,
          quote_volume NUMERIC NOT NULL,
          trades_count INTEGER,
          is_closed INTEGER DEFAULT 1,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(exchange, symbol, interval, open_time)
        )
      `);

      // 创建交易对信息表
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS symbols (
          id SERIAL PRIMARY KEY,
          exchange TEXT NOT NULL,
          symbol TEXT NOT NULL,
          base_asset TEXT NOT NULL,
          quote_asset TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT DEFAULT 'active',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(exchange, symbol, type)
        )
      `);

      // 创建索引
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_klines_exchange_symbol ON klines(exchange, symbol);
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_klines_interval ON klines(interval);
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_klines_open_time ON klines(open_time DESC);
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_klines_composite ON klines(exchange, symbol, interval, open_time DESC);
      `);

      console.log('✅ PostgreSQL 数据库初始化完成');
    } catch (error: any) {
      console.error('❌ 数据库初始化失败:', error.message);
      throw error;
    }
  }

  // 获取 K 线数据
  async getKlines(
    exchange: string,
    symbol: string,
    interval: string,
    limit: number = 2000,
    before?: number,
  ): Promise<any[]> {
    const beforeCondition = before
      ? `AND open_time < ${before}`
      : '';

    const query = `
      SELECT * FROM klines
      WHERE exchange = $1
        AND symbol = $2
        AND interval = $3
        ${beforeCondition}
      ORDER BY open_time DESC
      LIMIT $4
    `;

    const params = before
      ? [exchange, symbol, interval, limit]
      : [exchange, symbol, interval, limit];

    const result: QueryResult = await this.pool.query(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      exchange: row.exchange,
      symbol: row.symbol,
      interval: row.interval,
      open_time: Number(row.open_time),
      close_time: Number(row.close_time),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      quote_volume: Number(row.quote_volume),
      trades_count: row.trades_count,
      is_closed: row.is_closed,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  // 保存 K 线数据
  saveKline(kline: {
    exchange: string;
    symbol: string;
    interval: string;
    open_time: number;
    close_time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    quote_volume: number;
    trades_count?: number;
    is_closed?: number;
  }, callback?: (error: Error | null) => void): void {
    const query = `
      INSERT INTO klines (
        exchange, symbol, interval, open_time, close_time,
        open, high, low, close, volume, quote_volume,
        trades_count, is_closed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (exchange, symbol, interval, open_time)
      DO UPDATE SET
        close = EXCLUDED.close,
        high = GREATEST(klines.high, EXCLUDED.high),
        low = LEAST(klines.low, EXCLUDED.low),
        volume = klines.volume + EXCLUDED.volume,
        quote_volume = klines.quote_volume + EXCLUDED.quote_volume,
        trades_count = klines.trades_count + EXCLUDED.trades_count,
        is_closed = EXCLUDED.is_closed,
        updated_at = CURRENT_TIMESTAMP
    `;

    const params = [
      kline.exchange,
      kline.symbol,
      kline.interval,
      kline.open_time,
      kline.close_time,
      kline.open,
      kline.high,
      kline.low,
      kline.close,
      kline.volume,
      kline.quote_volume,
      kline.trades_count || 0,
      kline.is_closed !== undefined ? kline.is_closed : 1,
    ];

    this.pool.query(query, params, (error) => {
      if (callback) {
        callback(error || null);
      }
    });
  }

  // 批量保存 K 线数据
  saveKlines(klines: any[], callback?: (error: Error | null) => void): void {
    if (klines.length === 0) {
      if (callback) callback(null);
      return;
    }

    const query = `
      INSERT INTO klines (
        exchange, symbol, interval, open_time, close_time,
        open, high, low, close, volume, quote_volume,
        trades_count, is_closed
      ) VALUES ${klines
        .map(
          (_, i) =>
            `($${i * 13 + 1}, $${i * 13 + 2}, $${i * 13 + 3}, $${i * 13 + 4}, $${i * 13 + 5}, $${i * 13 + 6}, $${i * 13 + 7}, $${i * 13 + 8}, $${i * 13 + 9}, $${i * 13 + 10}, $${i * 13 + 11}, $${i * 13 + 12}, $${i * 13 + 13})`,
        )
        .join(', ')}
      ON CONFLICT (exchange, symbol, interval, open_time)
      DO UPDATE SET
        close = EXCLUDED.close,
        high = GREATEST(klines.high, EXCLUDED.high),
        low = LEAST(klines.low, EXCLUDED.low),
        volume = klines.volume + EXCLUDED.volume,
        quote_volume = klines.quote_volume + EXCLUDED.quote_volume,
        trades_count = klines.trades_count + EXCLUDED.trades_count,
        is_closed = EXCLUDED.is_closed,
        updated_at = CURRENT_TIMESTAMP
    `;

    const params = klines.flatMap((k) => [
      k.exchange,
      k.symbol,
      k.interval,
      k.open_time,
      k.close_time,
      k.open,
      k.high,
      k.low,
      k.close,
      k.volume,
      k.quote_volume,
      k.trades_count || 0,
      k.is_closed !== undefined ? k.is_closed : 1,
    ]);

    this.pool.query(query, params, (error) => {
      if (callback) {
        callback(error || null);
      }
    });
  }

  // 获取交易对列表
  async getSymbols(exchange?: string, type?: string): Promise<any[]> {
    let query = 'SELECT * FROM symbols WHERE 1=1';
    const params: any[] = [];

    if (exchange) {
      params.push(exchange);
      query += ` AND exchange = $${params.length}`;
    }

    if (type) {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }

    query += ' ORDER BY symbol';

    const result: QueryResult = await this.pool.query(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      exchange: row.exchange,
      symbol: row.symbol,
      base_asset: row.base_asset,
      quote_asset: row.quote_asset,
      type: row.type,
      status: row.status,
      created_at: row.created_at,
    }));
  }

  // 保存交易对信息
  async saveSymbol(symbol: {
    exchange: string;
    symbol: string;
    base_asset: string;
    quote_asset: string;
    type: string;
    status?: string;
  }): Promise<void> {
    const query = `
      INSERT INTO symbols (exchange, symbol, base_asset, quote_asset, type, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (exchange, symbol, type)
      DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
    `;

    const params = [
      symbol.exchange,
      symbol.symbol,
      symbol.base_asset,
      symbol.quote_asset,
      symbol.type,
      symbol.status || 'active',
    ];

    await this.pool.query(query, params);
  }

  // 关闭数据库连接
  async close(): Promise<void> {
    await this.pool.end();
  }
}

export const db = new DatabaseService();
