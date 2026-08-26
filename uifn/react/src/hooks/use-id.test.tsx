import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { useId } from './use-id';

function UseIdHarness({ testId }: { testId: string }) {
  const id = useId(undefined, { prefix: 'dialog', slot: 'content' });
  return <div data-testid={testId} id={id} />;
}

describe('useId', () => {
  it('uses React-owned hydration-safe ids without process-global fallback state', () => {
    render(<><UseIdHarness testId="first" /><UseIdHarness testId="second" /></>);

    expect(screen.getByTestId('first').id).toMatch(/^uifn-dialog-content-/);
    expect(screen.getByTestId('second').id).toMatch(/^uifn-dialog-content-/);
    expect(screen.getByTestId('first').id).not.toBe(screen.getByTestId('second').id);
  });
});
