import { createRequire } from 'node:module';
import { resolveProxyUrl } from './proxy.js';

const require = createRequire(import.meta.url);
const { HttpsProxyAgent } = require('https-proxy-agent') as typeof import('https-proxy-agent');

export type ExchangeTransportMode = 'direct' | 'proxy' | 'auto';
export type ExchangeTransportKind = 'direct' | 'proxy';

export interface ExchangeTransportChannelConfig {
  mode: ExchangeTransportMode;
  order: ExchangeTransportKind[];
}

export interface ExchangeTransportConfig {
  rest: ExchangeTransportChannelConfig;
  ws: ExchangeTransportChannelConfig;
  proxyUrl: string | null;
}

export interface TransportAttempt {
  kind: ExchangeTransportKind;
  agent?: import('https-proxy-agent').HttpsProxyAgent<string>;
}

export class TransportAttemptError extends Error {
  constructor(
    readonly attempts: ExchangeTransportKind[],
    readonly cause: unknown,
  ) {
    super(`All transport attempts failed: ${attempts.join(' -> ')}`);
  }
}

type ExchangeTransportEnv = Partial<Record<
  'EXCHANGE_REST_TRANSPORT' | 'EXCHANGE_WS_TRANSPORT' | 'EXCHANGE_PROXY_URL' | 'HTTP_PROXY' | 'HTTPS_PROXY' | 'ALL_PROXY',
  string
>>;

export function createExchangeTransportConfig(
  env: ExchangeTransportEnv = process.env,
): ExchangeTransportConfig {
  const proxyUrl = env.EXCHANGE_PROXY_URL?.trim() || resolveProxyUrl(env) || null;

  return {
    rest: createChannelConfig(env.EXCHANGE_REST_TRANSPORT, ['direct', 'proxy']),
    ws: createChannelConfig(env.EXCHANGE_WS_TRANSPORT, ['proxy', 'direct']),
    proxyUrl,
  };
}

export function createTransportAttempts(
  channel: ExchangeTransportChannelConfig,
  proxyUrl: string | null,
): TransportAttempt[] {
  return channel.order
    .filter((kind) => kind === 'direct' || proxyUrl)
    .map((kind) => ({
    kind,
    agent: kind === 'proxy' && proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined,
  }));
}

export async function runTransportAttempts<T>(
  attempts: TransportAttempt[],
  runner: (attempt: TransportAttempt) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (const attempt of attempts) {
    try {
      return await runner(attempt);
    } catch (error) {
      lastError = error;
    }
  }

  throw new TransportAttemptError(
    attempts.map((attempt) => attempt.kind),
    lastError,
  );
}

function createChannelConfig(
  rawMode: string | undefined,
  autoOrder: ExchangeTransportKind[],
): ExchangeTransportChannelConfig {
  const mode = normalizeMode(rawMode);

  if (mode === 'direct') {
    return {
      mode,
      order: ['direct'],
    };
  }

  if (mode === 'proxy') {
    return {
      mode,
      order: ['proxy'],
    };
  }

  return {
    mode: 'auto',
    order: autoOrder,
  };
}

function normalizeMode(rawMode: string | undefined): ExchangeTransportMode {
  if (rawMode === 'direct' || rawMode === 'proxy' || rawMode === 'auto') {
    return rawMode;
  }

  return 'auto';
}
