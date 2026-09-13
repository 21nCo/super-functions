export interface ParallelOptions {
  concurrency?: number;
}

export async function runParallelOrdered<TInput, TOutput>(
  steps: Array<((input: TInput) => Promise<TOutput> | TOutput) | (() => Promise<TOutput> | TOutput)>,
  input: TInput,
  options: ParallelOptions = {}
): Promise<TOutput[]> {
  const concurrency = Math.max(1, options.concurrency ?? steps.length ?? 1);
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
      results[currentIndex] =
        step.length === 0 ? await (step as () => Promise<TOutput> | TOutput)() : await (step as (input: TInput) => Promise<TOutput> | TOutput)(input);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(steps.length, 1)) }, () => worker()));
  return results;
}
