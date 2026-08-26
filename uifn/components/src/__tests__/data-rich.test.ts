import { describe, it } from 'vitest';
import { verifyRegistryBatch } from './registry-contract';

describe('data-rich registry contract', () => {
  it('registry', () => verifyRegistryBatch('data-rich'));
});
