export interface ParallelOptions {
  concurrency?: number;
}

export async function runParallelOrdered<TInput, TOutput>(
  steps: Array<((input: TInput) => Promise<TOutput> | TOutput) | (() => Promise<TOutput> | TOutput)>,
  input: TInput,
  options: ParallelOptions = {}
): Promise<TOutput[]> {
  const concurrency = options.concurrency ?? Math.max(steps.length, 1);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new RangeError("concurrency must be a positive safe integer");
  }
  const results = new Array<TOutput>(steps.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= steps.length) {
        return;
      }
      const step = steps[currentIndex]!;
      results[currentIndex] = await (step as (input: TInput) => Promise<TOutput> | TOutput)(input);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(steps.length, 1)) }, () => worker()));
  return results;
}
