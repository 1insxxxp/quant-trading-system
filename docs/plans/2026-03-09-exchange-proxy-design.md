# Exchange Proxy Design

## Problem

This machine cannot reach Binance or OKX directly. Historical REST requests and live WebSocket subscriptions time out, so real market data never arrives.

## Recommended Approach

Route all exchange traffic through a local HTTP proxy at `http://127.0.0.1:7890` by default, while still allowing `HTTP_PROXY`, `HTTPS_PROXY`, or `ALL_PROXY` to override it.

## Behavior

1. Binance and OKX REST requests use a shared proxy-aware Axios transport.
2. Binance and OKX WebSocket clients use the same proxy through an agent.
3. Demo-candle fallback is disabled by default so the UI no longer presents synthetic data as real data.
4. If remote data is still unavailable, the backend returns cached data if present, otherwise an empty result and the frontend continues to show a clear empty-state message.

## Tradeoffs

- Pros: real exchange traffic can work on this machine without changing frontend behavior.
- Cons: this now depends on the local proxy actually being alive at `127.0.0.1:7890`.
