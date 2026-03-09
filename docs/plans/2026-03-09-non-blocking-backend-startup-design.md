# Non-Blocking Backend Startup Design

**Date:** 2026-03-09

**Problem**

The backend currently waits for exchange symbol loading and kline prewarm before starting HTTP. When Binance or OKX is slow or unreachable, the service appears down even though local APIs such as `/api/health` do not depend on upstream exchanges.

**Scope**

- Start HTTP and WebSocket listeners immediately.
- Run exchange initialization and kline prewarm in the background.
- Prevent warmup failures from crashing startup.
- Keep the existing initialization logic and API surface intact.

**Decision**

Introduce a small startup coordinator that owns sequencing:

1. Start HTTP listener.
2. Start WebSocket listener.
3. Schedule exchange warmup asynchronously.
4. Catch warmup errors and log them without terminating the process.

This keeps the fix narrow and testable without redesigning the exchange adapters or the API layer.

**Architecture**

- `server.ts` remains the entrypoint.
- New startup helper encapsulates non-blocking sequencing.
- Existing `initExchangeData()` stays responsible for symbol bootstrap and historical kline prewarm.
- Warmup runs in a background microtask so listener startup is never delayed by network I/O.

**Failure Handling**

- If warmup fails entirely, listeners stay up.
- If part of warmup fails, existing per-exchange logging remains in place.
- No retries are added in this change; the goal is availability, not resilience policy expansion.

**Testing**

- Unit test: startup helper launches HTTP and WebSocket before warmup resolves.
- Unit test: warmup rejection is caught and reported instead of surfacing as an unhandled failure.
- Verification: `npm test -- --run`
- Verification: `npm run build`
