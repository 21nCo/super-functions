import { describe, expect, it } from 'vitest';

import {
  CONDUCT_PHASE_STATUS_CHECK,
  CONDUCT_PHASE_UNIQUE_INDEX,
  PHASE_STATUS_VALUES,
  conductSpecsTable,
  getConductSchemaConstraintNames,
  isValidPhaseStatus,
} from '../examples/conduct-drizzle-fallback.js';

describe('direct drizzle fallback schema support', () => {
  it('declares composite unique and check constraints', () => {
    const constraints = getConductSchemaConstraintNames();

    expect(constraints.indexes).toContain(CONDUCT_PHASE_UNIQUE_INDEX);
    expect(constraints.checks).toContain(CONDUCT_PHASE_STATUS_CHECK);
  });

  it('provides deterministic allowed status validation', () => {
    expect(PHASE_STATUS_VALUES).toEqual(['pending', 'in_progress', 'complete', 'failed', 'blocked']);
    expect(isValidPhaseStatus('in_progress')).toBe(true);
    expect(isValidPhaseStatus('archived')).toBe(false);
  });

  it('keeps the table contract stable for direct imports', () => {
    expect(conductSpecsTable.specId.name).toBe('spec_id');
    expect(conductSpecsTable.phaseNumber.name).toBe('phase_number');
    expect(conductSpecsTable.status.name).toBe('status');
  });
});
