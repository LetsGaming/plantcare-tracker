export interface Semaphore {
  run<T>(task: () => Promise<T>): Promise<T>;
}

/** FIFO semaphore: at most `limit` tasks run at once, the rest wait in a queue. */
export const createSemaphore = (limit: number): Semaphore => {
  let active = 0;
  const waiting: Array<() => void> = [];

  const acquire = (): Promise<void> => {
    if (active < limit) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => waiting.push(resolve));
  };

  const release = (): void => {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  };

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
};
