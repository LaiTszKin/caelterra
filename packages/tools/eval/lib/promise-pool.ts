/**
 * Promise pool concurrency control.
 * Limits the number of simultaneously executing promises.
 *
 * @typeParam T - Type of items in the input array
 * @typeParam R - Return type of the processing function
 * @param items - Array of items to process
 * @param fn - Processing function receiving (item, index) and returning a Promise
 * @param concurrency - Maximum concurrent executions
 * @returns Array of results in original order
 */
export async function promisePool<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  }

  const workers: Promise<void>[] = [];
  const limit = Math.min(concurrency, items.length);
  for (let i = 0; i < limit; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}
