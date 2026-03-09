import { describe, expect, it } from 'vitest';
import { resolveProxyUrl } from './proxy.js';

describe('resolveProxyUrl', () => {
  it('falls back to the local default proxy when env vars are unset', () => {
    const proxyUrl = resolveProxyUrl({});

    expect(proxyUrl).toBe('http://127.0.0.1:7890');
  });

  it('prefers HTTPS_PROXY over the local default', () => {
    const proxyUrl = resolveProxyUrl({
      HTTPS_PROXY: 'http://127.0.0.1:9999',
      HTTP_PROXY: 'http://127.0.0.1:8888',
    });

    expect(proxyUrl).toBe('http://127.0.0.1:9999');
  });
});
