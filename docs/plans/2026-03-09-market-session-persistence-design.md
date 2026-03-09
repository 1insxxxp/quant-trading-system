# Market Session Persistence And Animated Price Design

## Goal

Persist the active market selection for the current browser tab and make the headline market numbers feel live without adding noisy motion.

## Design Decisions

### Session-scoped market persistence

- Persist `exchange`, `symbol`, and `interval` in `sessionStorage`.
- Restore the persisted selection when the market store is created.
- Keep the persistence scoped to the current tab only.
- If the restored symbol is not available after symbol loading, fall back to the first valid option.

### Animated headline numbers

- Animate only the two headline metrics:
  - latest price
  - range change
- Keep connection status and current market cards static.
- Use a short count-up / count-down interpolation so updates feel responsive but remain readable.
- Re-run the animation whenever the displayed numeric value changes.

### Scope boundaries

- No backend changes.
- No websocket protocol changes.
- No new routing or page structure changes.

## Files To Touch

- `frontend/src/stores/marketStore.ts`
- `frontend/src/stores/marketStore.test.ts`
- `frontend/src/components/PriceBoard.tsx`
- `frontend/src/lib/marketDisplay.ts`

## Validation

- Refreshing the page restores the last selected exchange, symbol, and interval in the same tab.
- Invalid persisted symbols safely fall back after symbol options load.
- Latest price animates between values instead of jumping.
- Range change animates between values instead of jumping.
- Targeted frontend tests pass.
- Frontend build passes.
