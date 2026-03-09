# Kline Fallback Implementation

## Changes

1. Added backend demo-kline generation and `source` metadata for `/api/klines`.
2. Added short upstream request timeouts for Binance and OKX REST calls.
3. Updated the frontend store to track `klineSource`.
4. Triggered historical kline loading independently of WebSocket subscription.
5. Added a chart-level demo badge and note when fallback candles are shown.

## Verification

- `backend`: `npm test -- --run`
- `backend`: `npm run build`
- `frontend`: `npm test -- --run`
- `frontend`: `npm run build`
- `GET http://localhost:4000/api/klines?exchange=binance&symbol=BTCUSDT&interval=1h&limit=5`
- `GET http://localhost:5173/quant/api/klines?exchange=binance&symbol=BTCUSDT&interval=1h&limit=5`
