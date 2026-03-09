import { Pool, type QueryResult } from 'pg';

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'quant_trading',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

type QueryParams = readonly unknown[] | unknown[];

export interface PgQueryable {
  query(text: string, values?: QueryParams): Promise<QueryResult>;
  end(): Promise<void>;
}

export class DatabaseService {
  private readonly pool: PgQueryable;
  private readonly initPromise: Promise<void>;

  constructor(pool?: PgQueryable) {
    this.pool = pool ?? new Pool(DB_CONFIG);
    this.initPromise = this.init();
  }

  ready(): Promise<void> {
    return this.initPromise;
  }

  private async init() {
    try {
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
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(exchange, symbol, type)
        )
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_klines_exchange_symbol ON klines(exchange, symbol)
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_klines_interval ON klines(interval)
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_klines_open_time ON klines(open_time DESC)
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_klines_composite ON klines(exchange, symbol, interval, open_time DESC)
      `);

      console.log('PostgreSQL database initialized');
    } catch (error: any) {
      console.error('PostgreSQL database initialization failed:', error.message);
      throw error;
    }
  }

  async getKlines(
    exchange: string,
    symbol: string,
    interval: string,
    limit: number = 2000,
    before?: number,
  ): Promise<any[]> {
    const hasBefore = typeof before === 'number';
    const query = `
      SELECT * FROM klines
      WHERE exchange = $1
        AND symbol = $2
        AND interval = $3
        ${hasBefore ? 'AND open_time < $4' : ''}
      ORDER BY open_time DESC
      LIMIT ${hasBefore ? '$5' : '$4'}
    `;
    const params = hasBefore
      ? [exchange, symbol, interval, before, limit]
      : [exchange, symbol, interval, limit];

    const result = await this.query(query, params);

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
      trades_count: row.trades_count ?? undefined,
      is_closed: row.is_closed,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  async saveKline(kline: {
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
  }): Promise<void> {
    const query = `
      INSERT INTO klines (
        exchange, symbol, interval, open_time, close_time,
        open, high, low, close, volume, quote_volume,
        trades_count, is_closed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (exchange, symbol, interval, open_time)
      DO UPDATE SET
        close_time = EXCLUDED.close_time,
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume,
        quote_volume = EXCLUDED.quote_volume,
        trades_count = EXCLUDED.trades_count,
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
      kline.trades_count ?? null,
      kline.is_closed ?? 1,
    ];

    await this.query(query, params);
  }

  async saveKlines(klines: Array<{
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
  }>): Promise<void> {
    if (klines.length === 0) {
      return;
    }

    const query = `
      INSERT INTO klines (
        exchange, symbol, interval, open_time, close_time,
        open, high, low, close, volume, quote_volume,
        trades_count, is_closed
      ) VALUES ${klines
        .map(
          (_, index) =>
            `($${index * 13 + 1}, $${index * 13 + 2}, $${index * 13 + 3}, $${index * 13 + 4}, $${index * 13 + 5}, $${index * 13 + 6}, $${index * 13 + 7}, $${index * 13 + 8}, $${index * 13 + 9}, $${index * 13 + 10}, $${index * 13 + 11}, $${index * 13 + 12}, $${index * 13 + 13})`,
        )
        .join(', ')}
      ON CONFLICT (exchange, symbol, interval, open_time)
      DO UPDATE SET
        close_time = EXCLUDED.close_time,
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume,
        quote_volume = EXCLUDED.quote_volume,
        trades_count = EXCLUDED.trades_count,
        is_closed = EXCLUDED.is_closed,
        updated_at = CURRENT_TIMESTAMP
    `;
    const params = klines.flatMap((kline) => [
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
      kline.trades_count ?? null,
      kline.is_closed ?? 1,
    ]);

    await this.query(query, params);
  }

  async getSymbols(exchange?: string, type?: string): Promise<any[]> {
    let query = 'SELECT * FROM symbols WHERE 1=1';
    const params: unknown[] = [];

    if (exchange) {
      params.push(exchange);
      query += ` AND exchange = $${params.length}`;
    }

    if (type) {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }

    query += ' ORDER BY symbol';

    const result = await this.query(query, params);

    return result.rows.map((row) => ({
      id: row.id,
      exchange: row.exchange,
      symbol: row.symbol,
      base_asset: row.base_asset,
      quote_asset: row.quote_asset,
      type: row.type,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

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
        base_asset = EXCLUDED.base_asset,
        quote_asset = EXCLUDED.quote_asset,
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

    await this.query(query, params);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async query(text: string, values?: QueryParams) {
    await this.ready();
    return this.pool.query(text, values);
  }
}

function shouldCreateDefaultDatabaseService() {
  return (
    process.env.NODE_ENV !== 'test' &&
    process.env.VITEST !== 'true' &&
    process.env.DISABLE_DEFAULT_DB_SERVICE !== 'true'
  );
}

export const db = (
  shouldCreateDefaultDatabaseService() ? new DatabaseService() : null
) as unknown as DatabaseService;
