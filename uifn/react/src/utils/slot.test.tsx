import React from 'react';
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Slot } from './slot';

it('keeps unchanged refs attached across renders and detaches replaced refs', () => {
  const parentRef = vi.fn();
  const firstRef = vi.fn();
  const nextRef = vi.fn();
  const view = render(<Slot ref={parentRef}><button ref={firstRef}>First</button></Slot>);
  const button = view.getByRole('button');
  view.rerender(<Slot ref={parentRef}><button ref={firstRef}>Updated</button></Slot>);
  expect(parentRef.mock.calls).toEqual([[button]]);
  expect(firstRef.mock.calls).toEqual([[button]]);
  view.rerender(<Slot ref={parentRef}><button ref={nextRef}>Updated</button></Slot>);
  expect(firstRef.mock.calls).toEqual([[button], [null]]);
  expect(nextRef.mock.calls).toEqual([[button]]);
  view.unmount();
  expect(nextRef.mock.calls).toEqual([[button], [null]]);
  expect(parentRef).toHaveBeenLastCalledWith(null);
});
