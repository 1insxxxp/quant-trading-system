# Dynamic Symbol Toolbar Design

**Date:** 2026-03-09

**Problem**

The frontend toolbar still hardcodes the market symbol list. That creates drift against backend data and makes exchange switching less trustworthy, even though the backend already exposes `/api/symbols`.

**Scope**

- Fetch available symbols from the backend for the active exchange.
- Keep the visible symbol set limited to BTC and ETH pairs.
- Preserve the current toolbar structure and trading dashboard layout.
- Add safe fallback behavior when symbol loading fails or returns no valid items.

**Decisions**

1. The frontend becomes the source of filtering behavior.
   - It will call `/quant/api/symbols?exchange=<exchange>&type=spot`.
   - It will keep only symbols whose base asset is `BTC` or `ETH`.

2. Symbol options move into application state.
   - `marketStore` will own `symbols`, `isLoadingSymbols`, and `fetchSymbols`.
   - `setExchange` will clear stale chart data immediately, then trigger symbol loading.

3. The selected symbol self-heals after exchange changes.
   - If the current symbol is not present in the fetched list, the store will switch to the first valid symbol.
   - If the list is empty or the request fails, the store falls back to a local default list so the toolbar remains usable.

4. The toolbar becomes data-driven.
   - The exchange selector stays static.
   - The symbol selector renders fetched options, shows loading state, and stays disabled only when no options exist.

**Data Flow**

1. App starts with default exchange `binance`.
2. A symbol fetch runs for the active exchange.
3. The store filters backend symbols down to BTC and ETH spot pairs.
4. The toolbar renders those symbols.
5. When the user changes exchange:
   - chart data clears immediately
   - symbol list enters loading state
   - new symbols arrive
   - current symbol is kept if still valid, otherwise replaced
   - kline loading continues for the resolved market

**Failure Handling**

- Backend timeout or error: log the failure and fall back to the local BTC/ETH list.
- Empty backend result: use the same fallback list.
- Missing base/quote metadata: derive label from the raw symbol string when needed.

**Testing**

- Store test: exchange change triggers symbol fetch.
- Store test: invalid current symbol is replaced with the first fetched valid symbol.
- Store test: failed symbol fetch falls back to local defaults.
- Build verification: `npm run build`
- Test verification: `npm test -- --run`
