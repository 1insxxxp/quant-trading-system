# Professional Kline Loading Design

## Goal

Replace the fixed 1000-bar loading path with a professional historical loading flow: fast initial load, incremental backfill on demand, and websocket updates that only touch the newest bars.

## Current Root Causes

- Frontend hard-codes `limit=1000` when requesting historical klines.
- Backend also defaults to `1000` in the HTTP layer, service layer, and SQLite query helper.
- Exchange adapters cap a single request:
  - Binance: `1000`
  - OKX: `100`
- There is no historical pagination path for fetching more than one upstream page.
- There is no left-scroll trigger to load older history in the chart.

## Design Decisions

### Backend historical loading

- Keep `/api/klines` as the main endpoint.
- Add an optional `before` query param for backward pagination.
- Make the service support:
  - latest `N` klines
  - `N` klines strictly earlier than `before`
- Query local SQLite first.
- If cache is insufficient, loop upstream requests until:
  - enough bars are gathered
  - upstream has no more history
  - the adapter-specific page limit is exhausted for the current batch
- Normalize all returned data before responding:
  - ascending by `open_time`
  - unique by `open_time`

### Frontend loading model

- Initial load fetches the latest `2000` klines.
- Older history loads in pages of `1000`.
- Add explicit store actions:
  - `loadInitialKlines`
  - `loadOlderKlines`
- Track:
  - `isLoadingOlderKlines`
  - `hasMoreHistoricalKlines`
- Reset pagination state on exchange, symbol, or interval changes.

### Chart-triggered incremental loading

- Watch the chart visible range.
- When the visible range approaches the earliest loaded bar, request older history.
- Prepend older bars to the current array after normalization.
- Prevent duplicate concurrent history loads.

### Realtime updates

- Keep websocket updates incremental.
- If the pushed kline matches the current last bar `open_time`, update only the last bar.
- If the pushed kline is newer, append it.
- Do not replace the full dataset when realtime messages arrive.

## Non-Goals

- No change to product layout.
- No multi-market cache prewarming redesign.
- No route changes.

## Files To Touch

- `backend/src/server.ts`
- `backend/src/services/kline.service.ts`
- `backend/src/database/sqlite.ts`
- `backend/src/exchanges/binance.ts`
- `backend/src/exchanges/okx.ts`
- `backend/src/types/index.ts`
- `frontend/src/stores/marketStore.ts`
- `frontend/src/stores/marketStore.test.ts`
- `frontend/src/components/KlineChart.tsx`
- `frontend/src/components/klineChartData.ts`
- `frontend/src/components/klineChartData.test.ts`

## Validation

- Initial load returns `2000` latest bars when available.
- Left scroll loads older bars in `1000`-bar pages.
- Bars remain strictly ascending and deduplicated.
- Realtime updates only update the last bar or append one new bar.
- Exchange / symbol / interval switches reset pagination correctly.
- Backend and frontend tests pass.
- Frontend build passes.
