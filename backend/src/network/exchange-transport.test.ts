import { describe, expect, it } from 'vitest';
import {
  createExchangeTransportConfig,
  createTransportAttempts,
  runTransportAttempts,
} from './exchange-transport.js';

describe('createExchangeTransportConfig', () => {
  it('defaults REST to auto preferring direct and WS to auto preferring proxy', () => {
    const config = createExchangeTransportConfig({});

    expect(config.rest.mode).toBe('auto');
    expect(config.rest.order).toEqual(['direct', 'proxy']);
    expect(config.ws.mode).toBe('auto');
    expect(config.ws.order).toEqual(['proxy', 'direct']);
    expect(config.proxyUrl).toBeNull();
  });

  it('honors explicit transport overrides and proxy URL', () => {
    const config = createExchangeTransportConfig({
      EXCHANGE_REST_TRANSPORT: 'proxy',
      EXCHANGE_WS_TRANSPORT: 'direct',
      EXCHANGE_PROXY_URL: 'http://127.0.0.1:7890',
    });

    expect(config.rest.mode).toBe('proxy');
    expect(config.rest.order).toEqual(['proxy']);
    expect(config.ws.mode).toBe('direct');
    expect(config.ws.order).toEqual(['direct']);
    expect(config.proxyUrl).toBe('http://127.0.0.1:7890');
  });

  it('falls back to legacy proxy env vars when EXCHANGE_PROXY_URL is unset', () => {
    const config = createExchangeTransportConfig({
      HTTP_PROXY: 'http://127.0.0.1:8899',
    } as never);

    expect(config.proxyUrl).toBe('http://127.0.0.1:8899');
  });
});

describe('createTransportAttempts', () => {
  it('builds a proxy agent only for attempts that use proxy', () => {
    const config = createExchangeTransportConfig({
      EXCHANGE_WS_TRANSPORT: 'auto',
      EXCHANGE_PROXY_URL: 'http://127.0.0.1:7890',
    });

    const attempts = createTransportAttempts(config.ws, config.proxyUrl);

    expect(attempts.map((attempt) => attempt.kind)).toEqual(['proxy', 'direct']);
    expect(attempts[0].agent).toBeDefined();
    expect(attempts[1].agent).toBeUndefined();
  });

  it('skips proxy attempts when no proxy URL is available', () => {
    const config = createExchangeTransportConfig({
      EXCHANGE_WS_TRANSPORT: 'auto',
    });

    const attempts = createTransportAttempts(config.ws, config.proxyUrl);

    expect(attempts.map((attempt) => attempt.kind)).toEqual(['direct']);
  });
});

describe('runTransportAttempts', () => {
  it('falls back to the next transport attempt when the preferred one fails', async () => {
    const config = createExchangeTransportConfig({
      EXCHANGE_REST_TRANSPORT: 'auto',
      EXCHANGE_PROXY_URL: 'http://127.0.0.1:7890',
    });
    const attempts = createTransportAttempts(config.rest, config.proxyUrl);
    const seen: string[] = [];

    const result = await runTransportAttempts(attempts, async (attempt) => {
      seen.push(attempt.kind);

      if (attempt.kind === 'direct') {
        throw new Error('direct failed');
      }

      return 'proxy succeeded';
    });

    expect(result).toBe('proxy succeeded');
    expect(seen).toEqual(['direct', 'proxy']);
  });
});
