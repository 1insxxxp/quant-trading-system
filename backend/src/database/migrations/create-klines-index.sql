-- Optimize K-line lookup performance for exchange/symbol/interval queries.
-- Supports getKlines patterns that filter by exchange, symbol, interval and sort by open_time DESC.

-- Composite index that matches the filter columns and sort order.
CREATE INDEX IF NOT EXISTS idx_klines_exchange_symbol_interval_time
ON klines (exchange, symbol, interval, open_time DESC);

-- Covering index for PostgreSQL 11+ to reduce table lookups on hot reads.
CREATE INDEX IF NOT EXISTS idx_klines_covering
ON klines (exchange, symbol, interval, open_time DESC)
INCLUDE (close_time, open, high, low, close, volume, quote_volume, trades_count, is_closed);

-- Fallback for databases that do not support INCLUDE:
-- CREATE INDEX IF NOT EXISTS idx_klines_lookup
-- ON klines (exchange, symbol, interval, open_time DESC);
