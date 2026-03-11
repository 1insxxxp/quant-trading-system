export function createSingleFlightRunner() {
  let activePromise: Promise<unknown> | null = null;

  return <T>(task: () => Promise<T>): Promise<T> => {
    if (activePromise) {
      return activePromise as Promise<T>;
    }

    let startedPromise: Promise<T>;

    try {
      startedPromise = Promise.resolve(task());
    } catch (error) {
      return Promise.reject(error);
    }

    const wrappedPromise = startedPromise.finally(() => {
      if (activePromise === wrappedPromise) {
        activePromise = null;
      }
    });

    activePromise = wrappedPromise;
    return wrappedPromise;
  };
}
