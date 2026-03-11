import { describe, expect, it } from 'vitest';
import { createSingleFlightRunner } from './singleFlight';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

describe('createSingleFlightRunner', () => {
  it('coalesces overlapping async invocations into one in-flight request', async () => {
    const gate = createSingleFlightRunner();
    const pending = deferred<string>();
    let callCount = 0;

    const task = async () => {
      callCount += 1;
      return pending.promise;
    };

    const first = gate(task);
    const second = gate(task);

    expect(callCount).toBe(1);
    expect(first).toBe(second);

    pending.resolve('ok');

    await expect(first).resolves.toBe('ok');
    await expect(second).resolves.toBe('ok');
  });

  it('allows the next invocation after the previous request settles', async () => {
    const gate = createSingleFlightRunner();
    let callCount = 0;

    await gate(async () => {
      callCount += 1;
      return 'first';
    });

    await gate(async () => {
      callCount += 1;
      return 'second';
    });

    expect(callCount).toBe(2);
  });
});
