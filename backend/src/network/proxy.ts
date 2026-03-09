import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { HttpsProxyAgent } = require('https-proxy-agent') as typeof import('https-proxy-agent');

type ProxyEnv = Partial<Record<'HTTPS_PROXY' | 'HTTP_PROXY' | 'ALL_PROXY', string>>;

export function resolveProxyUrl(env: ProxyEnv = process.env): string | null {
  return env.HTTPS_PROXY || env.HTTP_PROXY || env.ALL_PROXY || null;
}

export function createProxyAgent(
  env: ProxyEnv = process.env,
): import('https-proxy-agent').HttpsProxyAgent<string> | undefined {
  const proxyUrl = resolveProxyUrl(env);

  if (!proxyUrl) {
    return undefined;
  }

  return new HttpsProxyAgent(proxyUrl);
}
