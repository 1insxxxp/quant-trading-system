interface StartupSequenceOptions {
  startHttp: () => void;
  startWebSocket: () => void;
  warmup: () => Promise<void>;
  onWarmupError?: (error: unknown) => void;
  schedule?: (task: () => void) => void;
}

export function runStartupSequence({
  startHttp,
  startWebSocket,
  warmup,
  onWarmupError = (error) => {
    console.error('Background warmup failed:', error);
  },
  schedule = queueMicrotask,
}: StartupSequenceOptions): void {
  startHttp();
  startWebSocket();

  schedule(() => {
    void (async () => {
      try {
        await warmup();
      } catch (error) {
        onWarmupError(error);
      }
    })();
  });
}
