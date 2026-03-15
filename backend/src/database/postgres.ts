import { Pool, type QueryResult } from 'pg';
import type {
  ChartIndicatorSettings,
  KlineSyncState,
  KlineSyncStateUpdate,
  SymbolSyncState,
  SymbolSyncStateUpdate,
} from '../types/index.js';

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

const DEFAULT_CHART_INDICATOR_SETTINGS: ChartIndicatorSettings = {
  volume: false,
  ma5: false,
  ma10: false,
  ma20: false,
  ema12: false,
  ema26: false,
  rsi: false,
  macd: false,
  bollinger: false,
};

const CHART_PREFERENCES_KEY = 'chart-indicators';

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
    void this.initPromise.catch(() => undefined);
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
        CREATE TABLE IF NOT EXISTS kline_sync_state (
          exchange TEXT NOT NULL,
          symbol TEXT NOT NULL,
          interval TEXT NOT NULL,
          earliest_open_time BIGINT,
          latest_open_time BIGINT,
          has_more_history BOOLEAN NOT NULL DEFAULT false,
          last_history_sync_at TIMESTAMPTZ,
          last_realtime_sync_at TIMESTAMPTZ,
          last_history_error TEXT,
          last_realtime_error TEXT,
          source TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(exchange, symbol, interval)
        )
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS symbol_sync_state (
          exchange TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'idle',
          symbol_count INTEGER NOT NULL DEFAULT 0,
          last_sync_at TIMESTAMPTZ,
          last_error TEXT,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(exchange, type)
        )
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS chart_preferences (
          preference_key TEXT PRIMARY KEY,
          settings JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_kline_sync_state_latest ON kline_sync_state(exchange, symbol, interval, latest_open_time DESC)
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_symbol_sync_state_status ON symbol_sync_state(exchange, type, status)
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
    // 使用统一参数化查询，避免 SQL 拼接导致执行计划无法缓存
    const query = `
      SELECT exchange, symbol, interval, open_time, close_time,
             open, high, low, close, volume, quote_volume,
             trades_count, is_closed
      FROM klines
      WHERE exchange = $1
        AND symbol = $2
        AND interval = $3
        AND ($4::BIGINT IS NULL OR open_time < $4)
      ORDER BY open_time DESC
      LIMIT $5
    `;
    const params = [exchange, symbol, interval, before ?? null, limit];

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

  async getKlineSyncState(
    exchange: string,
    symbol: string,
    interval: string,
  ): Promise<KlineSyncState | null> {
    const result = await this.query(
      `
        SELECT *
        FROM kline_sync_state
        WHERE exchange = $1 AND symbol = $2 AND interval = $3
      `,
      [exchange, symbol, interval],
    );

    return result.rows[0] ? mapKlineSyncState(result.rows[0]) : null;
  }

  async upsertKlineSyncState(update: KlineSyncStateUpdate): Promise<void> {
    const current = await this.getKlineSyncState(update.exchange, update.symbol, update.interval);
    const next = {
      exchange: update.exchange,
      symbol: update.symbol,
      interval: update.interval,
      earliest_open_time: update.earliest_open_time !== undefined ? update.earliest_open_time : current?.earliest_open_time ?? null,
      latest_open_time: update.latest_open_time !== undefined ? update.latest_open_time : current?.latest_open_time ?? null,
      has_more_history: update.has_more_history !== undefined ? update.has_more_history : current?.has_more_history ?? false,
      last_history_sync_at: update.last_history_sync_at !== undefined ? update.last_history_sync_at : current?.last_history_sync_at ?? null,
      last_realtime_sync_at: update.last_realtime_sync_at !== undefined ? update.last_realtime_sync_at : current?.last_realtime_sync_at ?? null,
      last_history_error: update.last_history_error !== undefined ? update.last_history_error : current?.last_history_error ?? null,
      last_realtime_error: update.last_realtime_error !== undefined ? update.last_realtime_error : current?.last_realtime_error ?? null,
      source: update.source !== undefined ? update.source : current?.source ?? null,
    };

    await this.query(
      `
        INSERT INTO kline_sync_state (
          exchange, symbol, interval, earliest_open_time, latest_open_time,
          has_more_history, last_history_sync_at, last_realtime_sync_at,
          last_history_error, last_realtime_error, source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (exchange, symbol, interval)
        DO UPDATE SET
          earliest_open_time = EXCLUDED.earliest_open_time,
          latest_open_time = EXCLUDED.latest_open_time,
          has_more_history = EXCLUDED.has_more_history,
          last_history_sync_at = EXCLUDED.last_history_sync_at,
          last_realtime_sync_at = EXCLUDED.last_realtime_sync_at,
          last_history_error = EXCLUDED.last_history_error,
          last_realtime_error = EXCLUDED.last_realtime_error,
          source = EXCLUDED.source,
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        next.exchange,
        next.symbol,
        next.interval,
        next.earliest_open_time,
        next.latest_open_time,
        next.has_more_history,
        next.last_history_sync_at,
        next.last_realtime_sync_at,
        next.last_history_error,
        next.last_realtime_error,
        next.source,
      ],
    );
  }

  async getSymbolSyncState(exchange: string, type: string): Promise<SymbolSyncState | null> {
    const result = await this.query(
      `
        SELECT *
        FROM symbol_sync_state
        WHERE exchange = $1 AND type = $2
      `,
      [exchange, type],
    );

    return result.rows[0] ? mapSymbolSyncState(result.rows[0]) : null;
  }

  async upsertSymbolSyncState(update: SymbolSyncStateUpdate): Promise<void> {
    const current = await this.getSymbolSyncState(update.exchange, update.type);
    const next = {
      exchange: update.exchange,
      type: update.type,
      status: update.status !== undefined ? update.status : current?.status ?? 'idle',
      symbol_count: update.symbol_count !== undefined ? update.symbol_count : current?.symbol_count ?? 0,
      last_sync_at: update.last_sync_at !== undefined ? update.last_sync_at : current?.last_sync_at ?? null,
      last_error: update.last_error !== undefined ? update.last_error : current?.last_error ?? null,
    };

    await this.query(
      `
        INSERT INTO symbol_sync_state (
          exchange, type, status, symbol_count, last_sync_at, last_error
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (exchange, type)
        DO UPDATE SET
          status = EXCLUDED.status,
          symbol_count = EXCLUDED.symbol_count,
          last_sync_at = EXCLUDED.last_sync_at,
          last_error = EXCLUDED.last_error,
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        next.exchange,
        next.type,
        next.status,
        next.symbol_count,
        next.last_sync_at,
        next.last_error,
      ],
    );
  }

  async backfillKlineSyncState(): Promise<number> {
    const result = await this.query(`
      SELECT
        exchange,
        symbol,
        interval,
        MIN(open_time) AS earliest_open_time,
        MAX(open_time) AS latest_open_time
      FROM klines
      GROUP BY exchange, symbol, interval
      ORDER BY exchange, symbol, interval
    `);

    for (const row of result.rows) {
      await this.upsertKlineSyncState({
        exchange: String(row.exchange),
        symbol: String(row.symbol),
        interval: String(row.interval),
        earliest_open_time: Number(row.earliest_open_time),
        latest_open_time: Number(row.latest_open_time),
        has_more_history: true,
        source: String(row.exchange),
      });
    }

    return result.rows.length;
  }

  async backfillSymbolSyncState(): Promise<number> {
    const result = await this.query(`
      SELECT
        exchange,
        type,
        COUNT(*)::INTEGER AS symbol_count
      FROM symbols
      GROUP BY exchange, type
      ORDER BY exchange, type
    `);

    for (const row of result.rows) {
      await this.upsertSymbolSyncState({
        exchange: String(row.exchange),
        type: String(row.type),
        status: 'idle',
        symbol_count: Number(row.symbol_count),
      });
    }

    return result.rows.length;
  }

  async getChartIndicatorSettings(): Promise<ChartIndicatorSettings> {
    const result = await this.query(
      `
        SELECT settings
        FROM chart_preferences
        WHERE preference_key = $1
      `,
      [CHART_PREFERENCES_KEY],
    );

    return normalizeChartIndicatorSettings(result.rows[0]?.settings);
  }

  async saveChartIndicatorSettings(settings: ChartIndicatorSettings): Promise<ChartIndicatorSettings> {
    const normalizedSettings = normalizeChartIndicatorSettings(settings);

    await this.query(
      `
        INSERT INTO chart_preferences (preference_key, settings)
        VALUES ($1, $2::jsonb)
        ON CONFLICT (preference_key)
        DO UPDATE SET
          settings = EXCLUDED.settings,
          updated_at = CURRENT_TIMESTAMP
      `,
      [CHART_PREFERENCES_KEY, JSON.stringify(normalizedSettings)],
    );

    return normalizedSettings;
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

function mapKlineSyncState(row: Record<string, unknown>): KlineSyncState {
  return {
    exchange: String(row.exchange),
    symbol: String(row.symbol),
    interval: String(row.interval),
    earliest_open_time: row.earliest_open_time == null ? null : Number(row.earliest_open_time),
    latest_open_time: row.latest_open_time == null ? null : Number(row.latest_open_time),
    has_more_history: Boolean(row.has_more_history),
    last_history_sync_at: (row.last_history_sync_at as string | Date | null) ?? null,
    last_realtime_sync_at: (row.last_realtime_sync_at as string | Date | null) ?? null,
    last_history_error: (row.last_history_error as string | null) ?? null,
    last_realtime_error: (row.last_realtime_error as string | null) ?? null,
    source: (row.source as string | null) ?? null,
    created_at: row.created_at as string | Date,
    updated_at: row.updated_at as string | Date,
  };
}

function mapSymbolSyncState(row: Record<string, unknown>): SymbolSyncState {
  return {
    exchange: String(row.exchange),
    type: String(row.type),
    status: String(row.status),
    symbol_count: Number(row.symbol_count),
    last_sync_at: (row.last_sync_at as string | Date | null) ?? null,
    last_error: (row.last_error as string | null) ?? null,
    created_at: row.created_at as string | Date,
    updated_at: row.updated_at as string | Date,
  };
}

function normalizeChartIndicatorSettings(
  raw: unknown,
): ChartIndicatorSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_CHART_INDICATOR_SETTINGS };
  }

  const source = raw as Partial<Record<keyof ChartIndicatorSettings, unknown>>;

  return {
    volume: source.volume === true,
    ma5: source.ma5 === true,
    ma10: source.ma10 === true,
    ma20: source.ma20 === true,
    ema12: source.ema12 === true,
    ema26: source.ema26 === true,
    rsi: source.rsi === true,
    macd: source.macd === true,
    bollinger: source.bollinger === true,
  };
}
