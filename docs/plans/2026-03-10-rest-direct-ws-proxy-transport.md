# REST直连与WebSocket代理传输 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将交易所接入层改造成 REST 与 WebSocket 可独立配置的传输策略，默认实现 REST 优先直连、WebSocket 优先代理，并在失败时进行有限回退。

**Architecture:** 在 `backend/src/network` 新增统一传输策略解析层，让 Binance 和 OKX 适配器不再直接读取通用代理环境变量，而是分别获取 REST 与 WebSocket 的连接配置。通过 TDD 先锁定 `direct/proxy/auto` 的优先级、fallback 和 agent 注入行为，再以最小改动接入两个适配器。

**Tech Stack:** TypeScript、Node.js、axios、ws、Vitest

---

### Task 1: 传输策略解析层

**Files:**
- Create: `backend/src/network/exchange-transport.ts`
- Create: `backend/src/network/exchange-transport.test.ts`
- Modify: `backend/src/types/index.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { createExchangeTransportConfig } from './exchange-transport.js';

describe('createExchangeTransportConfig', () => {
  it('defaults REST to auto-preferring direct and WS to auto-preferring proxy', () => {
    const config = createExchangeTransportConfig({});

    expect(config.rest.mode).toBe('auto');
    expect(config.rest.order).toEqual(['direct', 'proxy']);
    expect(config.ws.mode).toBe('auto');
    expect(config.ws.order).toEqual(['proxy', 'direct']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/network/exchange-transport.test.ts`  
Expected: FAIL with module or symbol not found.

**Step 3: Write minimal implementation**

创建 `createExchangeTransportConfig()`，解析：

- `EXCHANGE_REST_TRANSPORT`
- `EXCHANGE_WS_TRANSPORT`
- `EXCHANGE_PROXY_URL`

返回每个通道的：

- `mode`
- `order`
- `proxyUrl`

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/network/exchange-transport.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/network/exchange-transport.ts backend/src/network/exchange-transport.test.ts backend/src/types/index.ts
git commit -m "test: add exchange transport config parsing"
```

### Task 2: auto 回退与 agent 选择

**Files:**
- Modify: `backend/src/network/exchange-transport.ts`
- Modify: `backend/src/network/exchange-transport.test.ts`

**Step 1: Write the failing test**

```ts
it('builds proxy agents only for attempts that use proxy', () => {
  const config = createExchangeTransportConfig({
    EXCHANGE_WS_TRANSPORT: 'auto',
    EXCHANGE_PROXY_URL: 'http://127.0.0.1:7890',
  });

  const attempts = createTransportAttempts(config.ws);

  expect(attempts.map((attempt) => attempt.kind)).toEqual(['proxy', 'direct']);
  expect(attempts[0].agent).toBeDefined();
  expect(attempts[1].agent).toBeUndefined();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/network/exchange-transport.test.ts`  
Expected: FAIL because `createTransportAttempts` is missing or returns wrong shape.

**Step 3: Write minimal implementation**

在 `exchange-transport.ts` 中补：

- `createTransportAttempts()`
- `kind = direct | proxy`
- `agent`
- `label`

对 `proxy` 尝试使用已有 `HttpsProxyAgent`。

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/network/exchange-transport.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/network/exchange-transport.ts backend/src/network/exchange-transport.test.ts
git commit -m "test: add transport attempt selection"
```

### Task 3: Binance REST 与 WebSocket 接入

**Files:**
- Modify: `backend/src/exchanges/binance.ts`
- Create: `backend/src/exchanges/binance.transport.test.ts`
- Modify: `backend/src/network/exchange-transport.ts`

**Step 1: Write the failing test**

```ts
it('uses REST direct attempt and WS proxy attempt by default', () => {
  const adapter = new BinanceAdapter({
    transportConfig: createExchangeTransportConfig({
      EXCHANGE_PROXY_URL: 'http://127.0.0.1:7890',
    }),
  });

  expect(adapter.debugTransport().rest.order[0]).toBe('direct');
  expect(adapter.debugTransport().ws.order[0]).toBe('proxy');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/exchanges/binance.transport.test.ts`  
Expected: FAIL because adapter does not expose injectable transport config.

**Step 3: Write minimal implementation**

在 `BinanceAdapter` 中：

- 注入 transport config（默认从环境生成）
- REST 请求根据 attempt 设置 `httpAgent/httpsAgent/proxy:false`
- WebSocket 根据 attempt 设置 `agent`
- `auto` 模式下按顺序尝试，成功即返回

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/exchanges/binance.transport.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/exchanges/binance.ts backend/src/exchanges/binance.transport.test.ts backend/src/network/exchange-transport.ts
git commit -m "feat: route binance rest and ws transports separately"
```

### Task 4: OKX REST 与 WebSocket 接入

**Files:**
- Modify: `backend/src/exchanges/okx.ts`
- Create: `backend/src/exchanges/okx.transport.test.ts`

**Step 1: Write the failing test**

```ts
it('uses REST direct attempt and WS proxy attempt by default', () => {
  const adapter = new OKXAdapter({
    transportConfig: createExchangeTransportConfig({
      EXCHANGE_PROXY_URL: 'http://127.0.0.1:7890',
    }),
  });

  expect(adapter.debugTransport().rest.order[0]).toBe('direct');
  expect(adapter.debugTransport().ws.order[0]).toBe('proxy');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/exchanges/okx.transport.test.ts`  
Expected: FAIL because adapter still reads legacy proxy config directly.

**Step 3: Write minimal implementation**

在 `OKXAdapter` 中接入同样的 transport config 与 fallback 逻辑，保持与 Binance 一致。

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/exchanges/okx.transport.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/exchanges/okx.ts backend/src/exchanges/okx.transport.test.ts
git commit -m "feat: route okx rest and ws transports separately"
```

### Task 5: 日志与错误上下文

**Files:**
- Modify: `backend/src/exchanges/binance.ts`
- Modify: `backend/src/exchanges/okx.ts`
- Modify: `backend/src/network/exchange-transport.test.ts`

**Step 1: Write the failing test**

```ts
it('includes attempt labels when auto transport exhausts all options', async () => {
  await expect(runFailingAutoTransport()).rejects.toThrow(
    /proxy.*direct|direct.*proxy/,
  );
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/network/exchange-transport.test.ts src/exchanges/binance.transport.test.ts src/exchanges/okx.transport.test.ts`  
Expected: FAIL because errors do not yet include attempt context.

**Step 3: Write minimal implementation**

让 fallback 失败时的错误携带：

- transport kind
- attempt order
- 最终错误消息

同时在成功 fallback 时打印一条恢复日志。

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/network/exchange-transport.test.ts src/exchanges/binance.transport.test.ts src/exchanges/okx.transport.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/exchanges/binance.ts backend/src/exchanges/okx.ts backend/src/network/exchange-transport.test.ts
git commit -m "feat: add transport fallback diagnostics"
```

### Task 6: 环境模板与本地开发文档

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/src/dev/local-dev-config.ts`
- Modify: `backend/scripts/start-local-dev.ts`
- Modify: `docs/plans/2026-03-10-rest-direct-ws-proxy-transport-design.md`

**Step 1: Write the failing test**

```ts
it('keeps local dev defaults aligned with rest direct and ws proxy routing', () => {
  const config = buildLocalDevConfig({
    CLOUD_DB_SSH_PASSWORD: 'secret',
  }, { startFrontend: false, tunnelOnly: false });

  expect(config.exchange.restTransport).toBe('auto');
  expect(config.exchange.wsTransport).toBe('auto');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- --run src/dev/local-dev-config.test.ts`  
Expected: FAIL because local dev config does not expose exchange transport defaults.

**Step 3: Write minimal implementation**

补齐本地开发默认值与 `.env.example` 说明，确保新的 transport 变量在本地脚本里可见、可继承。

**Step 4: Run test to verify it passes**

Run: `npm test -- --run src/dev/local-dev-config.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add backend/.env.example backend/src/dev/local-dev-config.ts backend/scripts/start-local-dev.ts docs/plans/2026-03-10-rest-direct-ws-proxy-transport-design.md
git commit -m "docs: document split exchange transport defaults"
```

### Task 7: 全量验证

**Files:**
- Modify: none unless verification reveals issues

**Step 1: Run focused backend tests**

Run: `npm test -- --run src/network/exchange-transport.test.ts src/exchanges/binance.transport.test.ts src/exchanges/okx.transport.test.ts src/dev/local-dev-config.test.ts`
Expected: PASS

**Step 2: Run full backend test suite**

Run: `npm test -- --run`
Expected: PASS

**Step 3: Run backend build**

Run: `npm run build`
Expected: PASS

**Step 4: Manual local smoke check**

Run local backend with:

```bash
npm run dev
```

确认：

- REST warmup 不再强依赖代理
- WebSocket 实时链路恢复
- 失败日志包含 transport attempt 信息

**Step 5: Commit**

如果验证阶段无代码变更，则无需 commit；如果有修正，再提交：

```bash
git add <touched-files>
git commit -m "fix: finalize split exchange transport routing"
```
