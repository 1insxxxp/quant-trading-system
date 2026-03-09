# Realtime Trade Aggregation Design

## Goal

Make the active candle update every second using real exchange trade data, across Binance and OKX and for all supported intervals.

## Approach

Use trade streams as the primary realtime source. The backend keeps one live trade subscription per `exchange + symbol`, aggregates incoming trades into in-memory candles for each subscribed interval, and broadcasts the latest in-progress candle once per second.

## Data Flow

1. Frontend subscribes to `exchange + symbol + interval` over the existing backend WebSocket.
2. Backend opens or reuses one upstream trade stream for that `exchange + symbol`.
3. Each incoming trade updates every active interval state for that market.
4. A 1-second flush loop broadcasts the latest candle for each dirty interval.
5. Closed candles continue to be persisted through the existing kline save path.

## Notes

- This keeps the frontend simple: it still only consumes `kline` messages.
- Historical REST loading stays unchanged.
- If no prior current candle exists in cache, the first in-progress candle starts from the first observed trade after subscription.
