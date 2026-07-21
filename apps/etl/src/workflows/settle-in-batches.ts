/** Settles deterministic batches while preserving input order. */
export async function settleInBatches<T, R>(
  items: readonly T[],
  batchSize: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError(`batchSize must be a positive integer; received ${batchSize}`);
  }

  const results: PromiseSettledResult<R>[] = [];
  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((item, offset) => work(item, start + offset)),
    );
    results.push(...batchResults);
  }
  return results;
}
