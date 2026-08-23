import * as React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Checkbox,
  Dialog,
  useDialog,
} from '../index';

function HookDialogProbe() {
  const dialog = useDialog({ defaultOpen: false });

  return (
    <div>
      <span data-testid="hook-open">{dialog.state.open ? 'open' : 'closed'}</span>
      <button {...dialog.getPartProps('trigger', undefined, { type: 'button' })}>Open from hook</button>
      <section {...dialog.getPartProps('content')}>Hook content</section>
    </div>
  );
}

describe('React core adapter contract', () => {
  it('keeps useDialog and Dialog.Root behavior equivalent for trigger clicks', async () => {
    render(
      <>
        <HookDialogProbe />
        <Dialog.Root>
          <Dialog.Trigger>Open from component</Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Title>Component dialog</Dialog.Title>
          </Dialog.Content>
        </Dialog.Root>
      </>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open from hook' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open from component' }));

    await waitFor(() => {
      expect(screen.getByTestId('hook-open')).toHaveTextContent('open');
      expect(screen.getAllByRole('dialog', { hidden: true }).map((node) => node.getAttribute('data-state'))).toEqual([
        'open',
        'open',
      ]);
    });
  });

  it('exposes disabled checkbox behavior through core state and part props', () => {
    render(<Checkbox defaultChecked={false} disabled>
      <Checkbox.Control>
        <Checkbox.Indicator>selected</Checkbox.Indicator>
      </Checkbox.Control>
    </Checkbox>);

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(checkbox).toHaveAttribute('data-state', 'unchecked');
    expect(checkbox).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('selected')).toHaveAttribute('hidden');
  });

  it('hydrates controller-backed Dialog without warnings', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const html = renderToString(
      <Dialog defaultOpen>
        <Dialog.Trigger>Open server dialog</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Title>Hydrated dialog</Dialog.Title>
        </Dialog.Content>
      </Dialog>
    );
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await React.act(async () => {
      root = hydrateRoot(
        container,
        <Dialog defaultOpen>
          <Dialog.Trigger>Open server dialog</Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Title>Hydrated dialog</Dialog.Title>
          </Dialog.Content>
        </Dialog>
      );
      await Promise.resolve();
    });

    const hydrationErrors = errorSpy.mock.calls.filter(([message]) => {
      return (
        typeof message === 'string' &&
        !message.includes('useLayoutEffect does nothing on the server')
      );
    });
    expect(hydrationErrors).toEqual([]);
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();

    await React.act(async () => {
      root?.unmount();
      await Promise.resolve();
    });
    document.body.removeChild(container);
    errorSpy.mockRestore();
  });
});
