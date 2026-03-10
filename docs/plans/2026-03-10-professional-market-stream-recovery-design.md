# Professional Market Stream Recovery Design

## Goal

Upgrade the current market realtime path from a prototype-grade `1s kline flush` model into a professional terminal-style flow that:

- separates `price` and `kline` display lanes
- pushes UI updates in `200ms` batches
- preserves candle continuity across reconnects and silent intervals
- prevents the latest-price panel from lagging behind real trades

## Current Problems

The current implementation is usable, but it still behaves like a prototype in several important ways:

- the backend emits only `kline` realtime messages and flushes them once per second
- the frontend derives the latest price from `kline.close`, so price updates inherit the same coarse pacing
- the market stream seeds itself from the latest cached candle only, which is not sufficient to repair missing intervals after reconnects or delayed trade flow
- when trade timestamps jump across one or more intervals, the backend starts a fresh current candle but does not explicitly fill the missing periods
- the result is visible chart discontinuity, misleading price freshness, and fragile handoff between historical data and realtime data

These are acceptable trade-offs for an early prototype, but not for a professional market terminal.

## Recommended Approach

Implement a three-part realtime model:

1. `price lane`
   - trade ticks update an in-memory latest-price snapshot
   - the backend emits `price` websocket messages in `200ms` batches when price changed

2. `candle lane`
   - trade ticks continue to update per-interval active candles
   - the backend emits `kline` websocket messages in `200ms` batches only when a candle changed
   - the backend fills missing intervals before publishing the next active candle

3. `recovery lane`
   - when the stream detects a gap larger than one interval or reconnects after missing time, it backfills the missing historical candles from PostgreSQL first, then from the exchange if needed
   - if no real trades exist for a missing interval, the backend synthesizes a flat zero-volume candle so the timeline remains continuous

This keeps the UI smooth, keeps the chart continuous, and avoids coupling UI refresh frequency to storage writes.

## Backend Architecture

### Market realtime state

Each `exchange + symbol` stream should own a long-lived in-memory realtime state:

- `latestPrice`
- `latestTradeTimestamp`
- `priceDirty`
- per-interval active candle state
- per-interval last emitted candle open time
- per-interval last closed candle open time
- pending closed candles waiting for persistence and broadcast
- gap-recovery metadata, including whether a backfill is currently running

This replaces the current minimal `dirty current candle + pending closed candles` model with an explicit market-state object that can reason about missing periods.

### Display cadence

Replace the fixed `1000ms` display timer with a `200ms` display timer.

At each tick:

- if `priceDirty`, emit exactly one `price` message for the market
- if an interval has closed candles pending, emit them in order
- if an interval has an updated current candle, emit the latest current candle

This gives the frontend a much more responsive price lane without turning the chart into a full redraw loop.

### Persistence cadence

Decouple persistence from display:

- closed candles persist immediately when an interval rolls over
- open candles are checkpointed on a low-frequency timer, for example every `5s`
- price updates are not stored

This keeps PostgreSQL writes aligned with state transitions, not with UI paint cadence.

## Gap Recovery

### Realtime gap detection

For each interval, compare the incoming trade’s floored `open_time` with the current active candle’s `open_time`.

If the new trade belongs to:

- the same interval: update the current candle
- the next interval: close the current candle and open the new one
- more than one interval ahead: enter recovery

### Recovery strategy

When a gap is detected:

1. query PostgreSQL for the missing interval range
2. if PostgreSQL is incomplete, page the exchange REST API for the missing range
3. normalize, sort, and deduplicate the result
4. synthesize zero-volume candles for any still-missing intervals
5. persist the repaired sequence
6. broadcast the repaired candles before resuming normal realtime updates

This ensures the chart remains continuous even when the trade stream stalls or reconnects after missing time.

### Synthesized candles

When the backend has no real trade data for an interval that must exist on the time axis, it should generate:

- `open = previous close`
- `high = previous close`
- `low = previous close`
- `close = previous close`
- `volume = 0`
- `quote_volume = 0`
- `trades_count = 0`
- `is_closed = 1`

This is the standard “flat bar” approach used by professional charting systems to preserve time continuity without inventing market movement.

## WebSocket Contract

Keep a single websocket connection, but formalize separate message types:

- `connected`
- `subscribed`
- `unsubscribed`
- `price`
- `kline`
- `error`

Recommended payloads:

- `price`
  - `exchange`
  - `symbol`
  - `data.price`
  - `data.timestamp`

- `kline`
  - `exchange`
  - `symbol`
  - `interval`
  - `data` as the full normalized candle

The frontend should not infer price freshness from `kline` anymore.

## Frontend Behavior

### Separate price and candle state

The frontend store should keep:

- `latestPrice`
- `lastPriceTimestamp`
- `klines`
- `isBackfillingGap`
- existing historical loading state

`price` messages update only price state.  
`kline` messages update only the candle history.

### Historical to realtime handoff

After loading the initial `2000` historical candles:

- the frontend subscribes to realtime updates
- the backend emits realtime updates only for the active market session
- the frontend keeps the current market-session guard and ignores stale messages from previous subscriptions

When realtime messages arrive:

- same `open_time` as the last candle: replace the last candle only
- exactly one interval ahead: append one candle
- larger gap: trigger repaired candle insertion rather than naïve append

This removes the current fragile edge between history and realtime.

### View stability

The chart should remain append-or-update for realtime data.  
It should never full-replace the entire history set during ordinary market movement.

Historical backfill to the left keeps the existing prepend compensation behavior.  
Realtime gap repair should insert only the repaired candles and preserve the visible range.

## Error Handling

- if the trade stream disconnects, keep the existing reconnect behavior
- if recovery from PostgreSQL or exchange fails, mark the interval as degraded and log the failure, but do not crash the socket service
- if persistence fails, record the sync-state failure and continue UI broadcasting
- if a `price` message is missed, the next `price` or repaired `kline` still converges the UI

## Testing Strategy

### Backend

Add tests for:

- trade aggregation with independent dirty price state
- `200ms` display batching for `price` and `kline`
- interval rollover behavior
- multi-interval gap detection
- recovery from cached history
- recovery that synthesizes zero-volume candles
- immediate persistence of closed candles
- low-frequency checkpoint persistence for open candles

### Frontend

Add tests for:

- `price` messages updating only price state
- `kline` messages updating only the last candle or appending one candle
- repaired candle insertion preserving sort order
- market-session guard rejecting stale messages
- chart helpers avoiding full replace during ordinary realtime updates

## Non-Goals

- no orderbook or depth stream in this change
- no strategy-engine or execution-engine data bus changes in this change
- no multi-user personalization changes
- no redesign of historical left-scroll paging beyond making it compatible with the new realtime path

## Success Criteria

This change is successful when:

- latest price updates approximately every `200ms` during active trading
- the chart timeline remains continuous without visual gaps caused by reconnects or missing silent intervals
- realtime updates no longer depend on deriving price from `kline.close`
- PostgreSQL write frequency is lower than UI push frequency
- switching exchange, symbol, and interval still works correctly
- left-scroll historical paging still works after the realtime-path upgrade
