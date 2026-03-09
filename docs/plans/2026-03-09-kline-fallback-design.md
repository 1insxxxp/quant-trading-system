# Kline Fallback Design

## Problem

The chart rendered correctly, but it often stayed empty because:

1. Historical kline loading depended on a successful WebSocket subscription.
2. The backend waited on Binance or OKX even when those upstream services were unreachable.
3. When upstream data failed, the UI had no way to distinguish "no data yet" from "network-unavailable".

## Approach

Use a bounded fallback path that keeps the UI usable without pretending the data is live:

1. The frontend loads historical klines independently of WebSocket state.
2. Exchange REST calls use a short timeout.
3. If remote fetch fails and the cache is empty, the backend returns deterministic local demo klines.
4. The backend includes a `source` field in `/api/klines`, and the frontend surfaces a visible demo badge.

## Tradeoffs

- Pros: the chart becomes visible in constrained environments, the API responds quickly, and the UI is explicit when data is synthetic.
- Cons: demo candles are not tradable data and should not be used for real decisions; they are only a UI fallback.
