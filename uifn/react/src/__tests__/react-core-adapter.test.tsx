import * as React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AngleSlider,
  Checkbox,
  Dialog,
  Form,
  useDialog,
} from '../index';

function HookDialogProbe({ onClick }: { onClick?: React.MouseEventHandler<HTMLButtonElement> }) {
  const dialog = useDialog({ defaultOpen: false });

  return (
    <div>
      <span data-testid="hook-open">{dialog.state.open ? 'open' : 'closed'}</span>
      <button {...dialog.getPartProps('trigger', undefined, { type: 'button', onClick })}>Open from hook</button>
      <section {...dialog.getPartProps('content')}>Hook content</section>
    </div>
  );
}

describe('React core adapter contract', () => {
  it('keeps useDialog and Dialog.Root behavior equivalent for trigger clicks', async () => {
    const onClick = vi.fn();
    render(
      <>
        <HookDialogProbe onClick={onClick} />
        <Dialog.Root>
          <Dialog.Trigger>Open from component</Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Title>Component dialog</Dialog.Title>
          </Dialog.Content>
        </Dialog.Root>
      </>
    );

    const hookTrigger = screen.getByRole('button', { name: 'Open from hook' });
    expect(hookTrigger).toHaveAttribute('type', 'button');
    fireEvent.click(hookTrigger);
    fireEvent.click(screen.getByRole('button', { name: 'Open from component' }));
    expect(onClick).toHaveBeenCalledOnce();

    await waitFor(() => {
      expect(screen.getByTestId('hook-open')).toHaveTextContent('open');
      expect(screen.getAllByRole('dialog', { hidden: true }).map((node) => node.getAttribute('data-state'))).toEqual([
        'open',
        'open',
      ]);
    });
  });

  it('forwards native form attributes and routes AngleSlider names to its hidden input', () => {
    render(
      <>
        <Form.Root data-testid="native-form" action="/save" method="post" encType="multipart/form-data" />
        <AngleSlider.Root data-testid="angle-root" name="angle">
          <AngleSlider.HiddenInput data-testid="angle-input" />
        </AngleSlider.Root>
      </>,
    );

    expect(screen.getByTestId('native-form')).toHaveAttribute('action', '/save');
    expect(screen.getByTestId('native-form')).toHaveAttribute('method', 'post');
    expect(screen.getByTestId('native-form')).toHaveAttribute('enctype', 'multipart/form-data');
    expect(screen.getByTestId('angle-root')).not.toHaveAttribute('name');
    expect(screen.getByTestId('angle-input')).toHaveAttribute('name', 'angle');
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
