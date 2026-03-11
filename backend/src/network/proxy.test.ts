import { describe, expect, it } from 'vitest';
import { createProxyAgent, resolveProxyUrl } from './proxy.js';

describe('resolveProxyUrl', () => {
  it('returns null when env vars are unset', () => {
    const proxyUrl = resolveProxyUrl({});

    expect(proxyUrl).toBeNull();
  });

  it('prefers HTTPS_PROXY over the local default', () => {
    const proxyUrl = resolveProxyUrl({
      HTTPS_PROXY: 'http://127.0.0.1:9999',
      HTTP_PROXY: 'http://127.0.0.1:8888',
    });

    expect(proxyUrl).toBe('http://127.0.0.1:9999');
  });
});

describe('createProxyAgent', () => {
  it('creates an agent when a proxy url is configured', () => {
    const agent = createProxyAgent({
      HTTPS_PROXY: 'http://127.0.0.1:7890',
    });

    expect(agent).toBeDefined();
  });
});
