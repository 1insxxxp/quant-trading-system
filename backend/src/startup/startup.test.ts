import { describe, expect, it, vi } from 'vitest';
import { runStartupSequence } from './startup.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

describe('runStartupSequence', () => {
  it('starts listeners before warmup resolves', async () => {
    const warmup = deferred();
    let warmupResolved = false;
    const events: string[] = [];

    runStartupSequence({
      startHttp: () => {
        events.push(`http:${warmupResolved}`);
      },
      startWebSocket: () => {
        events.push(`ws:${warmupResolved}`);
      },
      warmup: async () => {
        await warmup.promise;
        warmupResolved = true;
      },
      onWarmupError: vi.fn(),
    });

    expect(events).toEqual(['http:false', 'ws:false']);

    warmup.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  it('captures warmup errors without blocking startup', async () => {
    const onWarmupError = vi.fn();
    const startHttp = vi.fn();
    const startWebSocket = vi.fn();
    const error = new Error('boom');

    runStartupSequence({
      startHttp,
      startWebSocket,
      warmup: async () => {
        throw error;
      },
      onWarmupError,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(startHttp).toHaveBeenCalledTimes(1);
    expect(startWebSocket).toHaveBeenCalledTimes(1);
    expect(onWarmupError).toHaveBeenCalledWith(error);
  });
});
