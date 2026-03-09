import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { HttpsProxyAgent } = require('https-proxy-agent') as typeof import('https-proxy-agent');

const DEFAULT_PROXY_URL = 'http://127.0.0.1:7890';

type ProxyEnv = Partial<Record<'HTTPS_PROXY' | 'HTTP_PROXY' | 'ALL_PROXY', string>>;

export function resolveProxyUrl(env: ProxyEnv = process.env): string {
  return env.HTTPS_PROXY || env.HTTP_PROXY || env.ALL_PROXY || DEFAULT_PROXY_URL;
}

export function createProxyAgent(env: ProxyEnv = process.env): import('https-proxy-agent').HttpsProxyAgent<string> {
  return new HttpsProxyAgent(resolveProxyUrl(env));
}
