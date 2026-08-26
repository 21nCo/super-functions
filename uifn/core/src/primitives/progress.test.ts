import { describe, expect, it } from 'vitest';
import { ProgressContract, createProgressController } from './progress';

describe('progress primitive', () => {
  it('omits value ARIA in indeterminate mode and clamps determinate values', () => {
    const indeterminate = ProgressContract.getParts({ value: null }, { scopeId: 'test' });
    expect(indeterminate.root.aria?.valuenow).toBeUndefined();
    const progress = createProgressController({ defaultValue: 40, max: 100 });
    progress.actions.setValue(135);
    expect(progress.state.value).toBe(100);
    expect(progress.state.mode).toBe('complete');
    progress.destroy();
  });
});
