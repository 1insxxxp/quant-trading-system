# PostgreSQL Deployment And WebSocket Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make PostgreSQL deployment configuration reproducible and remove benign WebSocket shutdown noise from backend logs.

**Architecture:** Add a repository-managed PM2 ecosystem that loads backend environment variables from `backend/.env`, and add a reusable exchange WebSocket close helper that handles `CONNECTING` sockets safely. Cover the close behavior with focused adapter tests and validate on the live server after deployment.

**Tech Stack:** Node.js, TypeScript, PM2, Vitest, ws

---

### Task 1: Document runtime configuration files

**Files:**
- Create: `backend/.env.example`
- Create: `backend/ecosystem.config.cjs`

**Step 1: Write the config files**

- Add a `.env.example` with PostgreSQL, port, and exchange timeout variables.
- Add a PM2 ecosystem config that reads `backend/.env` and starts `npm run start`.

**Step 2: Verify the files are internally consistent**

Run: `Get-Content backend\\.env.example` and `Get-Content backend\\ecosystem.config.cjs`
Expected: Variables and startup command match the backend runtime.

### Task 2: Add a failing regression test for safe WebSocket shutdown

**Files:**
- Create: `backend/src/exchanges/websocket-close.test.ts`
- Modify: `backend/src/exchanges/binance.ts`
- Modify: `backend/src/exchanges/okx.ts`

**Step 1: Write the failing test**

- Cover a `CONNECTING` socket path that must terminate instead of calling `close()`.
- Cover benign close-before-open error filtering.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/exchanges/websocket-close.test.ts`
Expected: FAIL because helper behavior does not exist yet.

### Task 3: Implement minimal safe-close helper

**Files:**
- Create: `backend/src/exchanges/websocket-close.ts`
- Modify: `backend/src/exchanges/binance.ts`
- Modify: `backend/src/exchanges/okx.ts`

**Step 1: Write minimal implementation**

- Add `safeCloseWebSocket()` and `isBenignCloseBeforeConnectError()`.
- Route adapter unsubscribe and `closeAll()` through the helper.
- Filter only the known benign close-before-connect error string.

**Step 2: Run targeted tests**

Run: `npm test -- --run src/exchanges/websocket-close.test.ts`
Expected: PASS

### Task 4: Run backend verification

**Files:**
- Test: `backend/src/**/*.test.ts`

**Step 1: Run full backend tests**

Run: `npm test -- --run`
Expected: PASS

**Step 2: Run build**

Run: `npm run build`
Expected: PASS

### Task 5: Deploy and verify on the server

**Files:**
- Server-local: `backend/.env`
- Server-local: PM2 process definition

**Step 1: Pull latest code and restart via PM2 ecosystem**

Run on server: `pm2 start backend/ecosystem.config.cjs --only quant-backend --update-env`
Expected: Backend restarts with env sourced from `backend/.env`.

**Step 2: Verify runtime**

Run on server:
- `curl http://127.0.0.1:4000/api/health`
- `curl "http://127.0.0.1:4000/api/symbols?exchange=binance&type=spot"`
- `curl "http://127.0.0.1:4000/api/klines?exchange=binance&symbol=BTCUSDT&interval=1h&limit=5"`

Expected: All endpoints return success.

**Step 3: Verify WebSocket noise is gone**

- Subscribe and quickly disconnect from backend WebSocket.
- Check PM2 error log tail for absence of the known benign close-before-connect message.

**Step 4: Commit**

```bash
git add backend/.env.example backend/ecosystem.config.cjs backend/src/exchanges/websocket-close.ts backend/src/exchanges/websocket-close.test.ts backend/src/exchanges/binance.ts backend/src/exchanges/okx.ts docs/plans/2026-03-09-postgres-deploy-websocket-cleanup-design.md docs/plans/2026-03-09-postgres-deploy-websocket-cleanup.md
git commit -m "fix: 收口 PostgreSQL 部署配置并清理 WebSocket 噪音日志"
```
