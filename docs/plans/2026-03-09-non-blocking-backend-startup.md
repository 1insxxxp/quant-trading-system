# Non-Blocking Backend Startup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the backend start serving HTTP and WebSocket immediately instead of waiting for exchange warmup.

**Architecture:** Add a small startup coordinator that starts listeners synchronously and schedules warmup in the background. Reuse the current initialization logic so the change stays localized to startup flow and test coverage.

**Tech Stack:** TypeScript, Express, ws, Vitest

---

### Task 1: Write Failing Startup Sequencing Tests

**Files:**
- Create: `backend/src/startup/startup.test.ts`
- Test: `backend/src/startup/startup.test.ts`

**Step 1: Write the failing sequencing test**

Cover:
- HTTP start happens before warmup resolves
- WebSocket start happens before warmup resolves

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/startup/startup.test.ts`
Expected: FAIL because the startup helper does not exist yet.

**Step 3: Write the failing warmup-error test**

Cover:
- warmup rejection is routed to an error handler
- startup listeners still begin

**Step 4: Run test to verify it fails**

Run: `npm test -- --run src/startup/startup.test.ts`
Expected: FAIL with missing module or missing behavior.

### Task 2: Implement Startup Coordinator

**Files:**
- Create: `backend/src/startup/startup.ts`
- Modify: `backend/src/server.ts`

**Step 1: Add the startup helper**

Implement:
- `runStartupSequence`
- synchronous listener startup
- background warmup scheduling
- warmup error handling

**Step 2: Wire server entrypoint to the helper**

Keep:
- current ports
- current HTTP routes
- current initialization body

Change:
- listener startup no longer awaits warmup

**Step 3: Run targeted tests**

Run: `npm test -- --run src/startup/startup.test.ts`
Expected: PASS

### Task 3: Verify Backend

**Files:**
- No new files

**Step 1: Run full backend tests**

Run: `npm test -- --run`
Expected: PASS

**Step 2: Run production build**

Run: `npm run build`
Expected: PASS

**Step 3: Manual runtime verification**

Verify:
- backend process starts
- `/api/health` responds before exchange warmup completes
- exchange warmup logs continue in background
