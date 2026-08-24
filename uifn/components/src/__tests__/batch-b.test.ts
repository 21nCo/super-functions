import { describe, it } from 'vitest';
import { verifyRegistryBatch } from './registry-contract';

describe('batch-b registry contract', () => {
  it('registry', () => verifyRegistryBatch('batch-b'));
});
