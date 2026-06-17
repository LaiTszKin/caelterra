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
  if (concurrency <= 0) {
    throw new Error(
      `promisePool: concurrency must be > 0, got ${String(concurrency)}`,
    );
  }
  const results: R[] = new Array<R>(items.length);
  /**
   * WARNING: 此實作依賴 JavaScript 單執行緒執行模型（shared mutable index）。
   * 不要在 `const i = index++` 和 `fn(items[i], i)` 之間加入 await，
   * 否則會引入競態條件導致項目被跳過或重複處理。
   */
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i] as T, i);
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
