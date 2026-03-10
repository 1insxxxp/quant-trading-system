# Professional Market Realtime Batching Design

## Goal

Upgrade the current market realtime path from a fixed 1-second candle flush loop into a professional terminal-style flow: latest price updates in 200ms batches, candle updates are decoupled from price updates, and database writes are no longer tied to UI push frequency.

## Current Problem

The current backend realtime path subscribes to exchange trade streams, aggregates them into in-memory candles, and flushes dirty candles once per second. That keeps the implementation simple, but it also means:

- latest price and candle updates share the same 1-second pacing
- the UI can feel laggy during fast markets
- the backend persists a kline on every realtime broadcast, which couples display cadence to database write pressure
- the frontend cannot treat price and candle updates differently

This is acceptable for a prototype, but it is not the shape of a professional trading terminal.

## Recommended Approach

Split the realtime system into two display lanes and one persistence lane:

1. `trade -> price lane`
   - every incoming trade updates an in-memory latest-price snapshot
   - the backend emits `price` messages in 200ms batches when the price changed

2. `trade -> candle lane`
   - the same trade stream continues updating in-memory active candles per interval
   - the backend emits `kline` messages in 200ms batches only for intervals whose active candle changed

3. `persistence lane`
   - price messages are not persisted
   - active, unclosed candles are not written on every UI flush
   - closed candles are written immediately when the interval rolls over
   - a low-frequency checkpoint writes current open candles periodically so a crash does not lose all in-progress state

This preserves a professional display feel without turning the database into a high-frequency write sink.

## Backend Architecture

### Market stream ownership

Keep one upstream trade subscription per `exchange + symbol`. Reuse that stream for all subscribed intervals of the same market, as the code already does today.

### In-memory state

Each market stream keeps:

- `latestPrice`
- `latestTradeTimestamp`
- `priceDirty`
- interval states for `1m / 5m / 15m / 1h / 4h / 1d`
- `current` active candle
- `pendingClosed` candles waiting to be persisted and emitted
- `candleDirty` flag per interval

### Flush cadence

Replace the fixed `1000ms` display timer with a `200ms` flush timer.

At each tick:

- if `priceDirty`, emit one `price` message for the market and clear `priceDirty`
- if an interval has `pendingClosed`, emit the closed candle(s)
- if an interval has `candleDirty`, emit the latest in-progress candle and clear `candleDirty`

This gives the UI a smoother feel while keeping the protocol deterministic.

### Persistence strategy

Decouple UI pushes from storage:

- on interval rollover:
  - mark the previous candle as closed
  - persist that closed candle immediately
  - update sync-state metadata
- on periodic checkpoint, for example every 5 seconds:
  - persist the current in-progress candle for active intervals
  - this is for resilience only, not for display
- on shutdown:
  - flush all active in-progress candles once

The key rule is that database writes are driven by market state transitions and checkpointing, not by every 200ms UI batch.

## WebSocket Protocol

Continue using the existing market WebSocket connection, but formalize two realtime payloads:

- `price`
  - fields: `exchange`, `symbol`, `data`
  - `data` is the latest trade price
- `kline`
  - fields: `exchange`, `symbol`, `interval`, `data`
  - `data` is the full latest candle

The `connected`, `subscribed`, `unsubscribed`, and `error` message types stay unchanged.

This avoids introducing a second socket while still separating semantics cleanly.

## Frontend Behavior

### Latest price

`useWebSocket` should consume `price` messages separately from `kline`.

- `price` updates only `latestPrice`
- `PriceBoard` continues animating the displayed number, but now receives higher-frequency updates
- price animation remains short and lightweight so the panel does not jitter under frequent updates

### Candle updates

`kline` messages continue to flow into `updateKline`.

- if the incoming candle has the same `open_time` as the last local candle, only replace the last candle
- if it starts a new interval, append one candle
- do not replace the whole history set on realtime updates

### Market switching

When exchange, symbol, or interval changes:

- historical loading still runs first
- the active websocket subscription is recreated for the new market
- stale `price` and `kline` messages from the previous market continue to be ignored using the current market key guard

## Error Handling

- if the trade stream disconnects, mark the market disconnected and rely on the existing reconnect client
- if persistence of a closed or checkpoint candle fails, record the failure in sync-state and log it, but do not block realtime UI pushes
- if a `price` message is missed, the next `price` or `kline.close` still converges the UI

## Testing Strategy

### Backend

- extend `trade-aggregator` tests to verify:
  - latest price updates track incoming trades
  - interval rollover closes and queues the previous candle
  - 200ms flush emits only dirty data
- extend `market-trade-stream` tests to verify:
  - `price` and `kline` batching are separated
  - no output is emitted when nothing changed
  - checkpoint persistence is not tied to display flush cadence

### Frontend

- extend `marketSocket` tests to verify parsing of `price` and `kline`
- extend `marketStore` tests to verify:
  - `setLatestPrice` updates without touching history
  - `updateKline` still only replaces the last candle or appends
- verify current chart tests still pass with the new message rhythm

## Non-Goals

- no order book or depth stream in this change
- no strategy-engine data bus changes in this change
- no separate ticker REST endpoint
- no changes to historical paging behavior beyond preserving compatibility

## Success Criteria

The change is successful when:

- latest price visibly updates at approximately 200ms cadence
- candle updates are no longer paced by a fixed 1-second loop
- realtime UI updates do not trigger full-history redraws
- PostgreSQL write frequency is materially lower than UI flush frequency
- market and interval switching still work correctly
