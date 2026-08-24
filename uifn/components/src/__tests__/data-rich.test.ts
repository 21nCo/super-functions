import { describe, it } from 'vitest';
import { verifyRegistryBatch } from './registry-contract';

describe('data-rich registry contract', () => {
  for (const name of ['interaction', 'large-data', 'a11y', 'visual', 'registry']) {
    it(name, () => verifyRegistryBatch('data-rich'));
  }
});
