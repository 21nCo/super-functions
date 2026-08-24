import { describe, it } from 'vitest';
import { verifyRegistryBatch } from './registry-contract';

describe('batch-a registry contract', () => {
  it('registry', () => verifyRegistryBatch('batch-a'));
});
