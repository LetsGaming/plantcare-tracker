/**
 * modules/sales/application/limiter.ts
 *
 * Concurrency limits for outbound scraping: Chromium pages and plain HTTP
 * requests are bounded separately.
 */

export type Task<T> = () => Promise<T>;
export type Limiter = <T>(fn: Task<T>) => Promise<T>;

export const CHROMIUM_CONCURRENCY = 2;
export const HTTP_CONCURRENCY = 8;

export const createLimiter = (max: number): Limiter => {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= max) return;
    const start = queue.shift();
    if (!start) return;
    active++;
    start();
  };

  return <T>(fn: Task<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        void Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
};

export interface ScrapeLimiters {
  chromium: Limiter;
  http: Limiter;
}

export const createScrapeLimiters = (): ScrapeLimiters => ({
  chromium: createLimiter(CHROMIUM_CONCURRENCY),
  http: createLimiter(HTTP_CONCURRENCY),
});
