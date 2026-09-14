export async function mapWithConcurrency<T, TResult>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<TResult>
): Promise<Array<TResult | Error>> {
  if (concurrency < 1) {
    throw new Error("concurrency must be >= 1");
  }

  const results: Array<TResult | Error> = new Array(values.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= values.length) {
        return;
      }
      try {
        results[index] = await mapper(values[index]!, index);
      } catch (error) {
        results[index] = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}
