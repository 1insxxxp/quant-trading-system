# PostgreSQL Deployment And WebSocket Cleanup Design

## Context

The server is already running on PostgreSQL, but the deployment is still relying on shell-exported environment variables from a one-off restart. That is fragile across `pm2 restart`, host reboot, and handoff to another operator.

There is also a noisy WebSocket error in the backend logs when an upstream exchange socket is closed before the handshake completes. The error does not break market data delivery, but it pollutes logs and makes real failures harder to spot.

## Goals

- Make backend PostgreSQL runtime configuration reproducible from repository-managed deployment files.
- Keep secrets in server-local `.env`, not hardcoded in code or PM2 command history.
- Eliminate the benign "closed before the connection was established" WebSocket noise on quick unsubscribe or shutdown.

## Approach

### Deployment Configuration

- Add a PM2 ecosystem config under `backend/` that reads `backend/.env` at startup.
- Keep application runtime code unchanged for env loading so local development stays simple.
- Add a `.env.example` template that documents the required variables for PostgreSQL and service ports.

### WebSocket Cleanup

- Add a small helper that safely closes exchange WebSocket connections.
- If a socket is still in `CONNECTING`, terminate it instead of calling `close()`.
- Suppress the specific benign error produced by this close path while keeping real socket errors visible.
- Use the helper in both Binance and OKX adapters for trade, kline, and global cleanup paths.

## Testing

- Add adapter-level tests that prove closing a `CONNECTING` socket does not call `close()` and does not surface the known benign error.
- Verify the backend build and full backend test suite.
- Deploy to the server with the PM2 ecosystem file and verify health, symbols, klines, and WebSocket subscription flow.
