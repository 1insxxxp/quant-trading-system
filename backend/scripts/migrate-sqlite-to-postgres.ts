import path from 'node:path';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'node:url';

process.env.DISABLE_DEFAULT_DB_SERVICE = 'true';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SQLITE_PATH = path.resolve(__dirname, '../sqlite.db');
const BATCH_SIZE = Number(process.env.SQLITE_MIGRATION_BATCH_SIZE ?? 500);

interface SqliteSymbolRow {
  exchange: string;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  type: string;
  status?: string;
}

interface SqliteKlineRow {
  id: number;
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
  trades_count?: number | null;
  is_closed?: number | null;
}

async function main() {
  const sqlitePath = process.env.SQLITE_MIGRATION_PATH || DEFAULT_SQLITE_PATH;

  await assertSqliteExists(sqlitePath);

  const sqliteDb = await openSqlite(sqlitePath);
  const { DatabaseService } = await import('../src/database/postgres.js');
  const postgresDb = new DatabaseService();

  try {
    await postgresDb.ready();

    console.log(`Migrating symbols from ${sqlitePath}`);
    const symbols = await all<SqliteSymbolRow>(
      sqliteDb,
      'SELECT exchange, symbol, base_asset, quote_asset, type, status FROM symbols ORDER BY id ASC',
    );

    for (const symbol of symbols) {
      await postgresDb.saveSymbol({
        exchange: symbol.exchange,
        symbol: symbol.symbol,
        base_asset: symbol.base_asset,
        quote_asset: symbol.quote_asset,
        type: symbol.type,
        status: symbol.status || 'active',
      });
    }

    console.log(`Migrated ${symbols.length} symbols`);
    console.log('Migrating klines in batches...');

    let migratedKlines = 0;
    let lastId = 0;

    while (true) {
      const rows = await all<SqliteKlineRow>(
        sqliteDb,
        `
          SELECT id, exchange, symbol, interval, open_time, close_time,
                 open, high, low, close, volume, quote_volume,
                 trades_count, is_closed
          FROM klines
          WHERE id > ?
          ORDER BY id ASC
          LIMIT ?
        `,
        [lastId, BATCH_SIZE],
      );

      if (rows.length === 0) {
        break;
      }

      await postgresDb.saveKlines(rows.map((row) => ({
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
        is_closed: row.is_closed ?? 1,
      })));

      migratedKlines += rows.length;
      lastId = rows[rows.length - 1].id;

      console.log(`Migrated ${migratedKlines} klines...`);
    }

    const symbolSyncStates = await postgresDb.backfillSymbolSyncState();
    const klineSyncStates = await postgresDb.backfillKlineSyncState();

    console.log(
      `Migration complete: ${symbols.length} symbols, ${migratedKlines} klines, ` +
      `${symbolSyncStates} symbol sync states, ${klineSyncStates} kline sync states`,
    );
  } finally {
    sqliteDb.close();
    await postgresDb.close();
  }
}

async function assertSqliteExists(sqlitePath: string) {
  const fs = await import('node:fs/promises');

  await fs.access(sqlitePath);
}

function openSqlite(filename: string) {
  return new Promise<sqlite3.Database>((resolve, reject) => {
    const db = new sqlite3.Database(filename, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(db);
    });
  });
}

function all<T>(db: sqlite3.Database, sql: string, params: unknown[] = []) {
  return new Promise<T[]>((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve((rows || []) as T[]);
    });
  });
}

main().catch((error) => {
  console.error('SQLite to PostgreSQL migration failed:', error);
  process.exit(1);
});
