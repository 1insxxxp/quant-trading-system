import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../../sqlite.db');
const DEFAULT_KLINE_QUERY_LIMIT = 2000;

export class DatabaseService {
  private db: sqlite3.Database;

  constructor() {
    this.db = new sqlite3.Database(DB_PATH);
    this.init();
  }

  private init() {
    this.db.serialize(() => {
      // 创建 K 线数据表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS klines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          exchange TEXT NOT NULL,
          symbol TEXT NOT NULL,
          interval TEXT NOT NULL,
          open_time INTEGER NOT NULL,
          close_time INTEGER NOT NULL,
          open REAL NOT NULL,
          high REAL NOT NULL,
          low REAL NOT NULL,
          close REAL NOT NULL,
          volume REAL NOT NULL,
          quote_volume REAL NOT NULL,
          trades_count INTEGER,
          is_closed INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(exchange, symbol, interval, open_time)
        )
      `);

      // 创建交易对信息表
      this.db.run(`
        CREATE TABLE IF NOT EXISTS symbols (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          exchange TEXT NOT NULL,
          symbol TEXT NOT NULL,
          base_asset TEXT NOT NULL,
          quote_asset TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(exchange, symbol, type)
        )
      `);

      // 创建索引
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_klines_exchange_symbol ON klines(exchange, symbol);
      `);
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_klines_interval ON klines(interval);
      `);
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_klines_open_time ON klines(open_time);
      `);

      console.log('✅ 数据库初始化完成');
    });
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
  }, callback?: (err: Error | null) => void) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO klines (
        exchange, symbol, interval, open_time, close_time,
        open, high, low, close, volume, quote_volume,
        trades_count, is_closed, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run(
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
      kline.trades_count || null,
      kline.is_closed !== undefined ? kline.is_closed : 1,
      callback || (() => {})
    );

    stmt.finalize();
  }

  // 批量保存 K 线数据
  saveKlines(klines: Array<{
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
  }>, callback?: (err: Error | null) => void) {
    this.db.serialize(() => {
      this.db.run('BEGIN TRANSACTION');

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO klines (
          exchange, symbol, interval, open_time, close_time,
          open, high, low, close, volume, quote_volume,
          trades_count, is_closed, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      klines.forEach((kline) => {
        stmt.run(
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
          kline.trades_count || null,
          kline.is_closed !== undefined ? kline.is_closed : 1
        );
      });

      stmt.finalize();
      this.db.run('COMMIT', callback || (() => {}));
    });
  }

  // 获取 K 线数据
  getKlines(
    exchange: string,
    symbol: string,
    interval: string,
    limit: number = DEFAULT_KLINE_QUERY_LIMIT,
    before?: number,
  ): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const beforeCondition = typeof before === 'number'
        ? ' AND open_time <= ?'
        : '';
      const params = typeof before === 'number'
        ? [exchange, symbol, interval, before, limit]
        : [exchange, symbol, interval, limit];

      this.db.all(
        `
        SELECT * FROM klines
        WHERE exchange = ? AND symbol = ? AND interval = ?
        ${beforeCondition}
        ORDER BY open_time DESC
        LIMIT ?
      `,
        params,
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            // 按时间正序返回
            resolve((rows || []).reverse());
          }
        }
      );
    });
  }

  // 保存交易对信息
  saveSymbol(symbol: {
    exchange: string;
    symbol: string;
    base_asset: string;
    quote_asset: string;
    type: string;
    status?: string;
  }, callback?: (err: Error | null) => void) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO symbols (
        exchange, symbol, base_asset, quote_asset, type, status
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      symbol.exchange,
      symbol.symbol,
      symbol.base_asset,
      symbol.quote_asset,
      symbol.type,
      symbol.status || 'active',
      callback || (() => {})
    );

    stmt.finalize();
  }

  // 获取交易对列表
  getSymbols(exchange?: string, type?: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM symbols';
      const params: any[] = [];

      const conditions: string[] = [];
      if (exchange) {
        conditions.push('exchange = ?');
        params.push(exchange);
      }
      if (type) {
        conditions.push('type = ?');
        params.push(type);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  // 关闭数据库
  close() {
    this.db.close();
  }
}

export const db = new DatabaseService();
