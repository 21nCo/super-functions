export function batchMutations<T>(mutations: T[], batchSize: number): T[][] {
  if (mutations.length === 0) return [];

  const batches: T[][] = [];
  for (let i = 0; i < mutations.length; i += batchSize) {
    batches.push(mutations.slice(i, i + batchSize));
  }
  return batches;
}
