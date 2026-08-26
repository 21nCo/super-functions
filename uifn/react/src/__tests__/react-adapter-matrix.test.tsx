import * as React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Checkbox,
  Dialog,
  Popover,
  Select,
  Tabs,
  Tooltip,
} from '../index';

function CorePrimitiveFixture() {
  return (
    <div>
      <Dialog defaultOpen>
        <Dialog.Trigger>Open dialog</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Title>Server dialog</Dialog.Title>
        </Dialog.Content>
      </Dialog>

      <Checkbox defaultChecked>
        <Checkbox.Control aria-label="Accept terms">
          <Checkbox.Indicator>Checked</Checkbox.Indicator>
        </Checkbox.Control>
      </Checkbox>

      <Tabs items={['overview', 'security']} defaultValue="overview">
        <Tabs.List>
          <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
          <Tabs.Trigger value="security">Security</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="overview">Overview panel</Tabs.Content>
        <Tabs.Content value="security">Security panel</Tabs.Content>
      </Tabs>

      <Select defaultOpen defaultValue="alpha" items={[{ value: 'alpha', label: 'Alpha' }]}>
        <Select.Trigger>
          <Select.ValueText />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="alpha">Alpha</Select.Item>
        </Select.Content>
      </Select>

      <Popover defaultOpen>
        <Popover.Trigger>Open popover</Popover.Trigger>
        <Popover.Content>
          <Popover.Title>Popover body</Popover.Title>
        </Popover.Content>
      </Popover>

      <Tooltip defaultOpen>
        <Tooltip.Trigger>Tooltip trigger</Tooltip.Trigger>
        <Tooltip.Content>Tooltip body</Tooltip.Content>
      </Tooltip>
    </div>
  );
}

function hydrationWarnings(calls: unknown[][]) {
  return calls.filter(([message]) => {
    return (
      typeof message === 'string' &&
      !message.includes('useLayoutEffect does nothing on the server')
    );
  });
}

describe('React adapter primitive matrix', () => {
  it('hydrates the core primitive component fixture without warnings', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const html = renderToString(<CorePrimitiveFixture />);

    expect(html).toContain('role="checkbox"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="combobox"');

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await React.act(async () => {
      root = hydrateRoot(container, <CorePrimitiveFixture />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hydrationWarnings(errorSpy.mock.calls)).toEqual([]);
    expect(container.querySelector('[role="checkbox"]')).toHaveAttribute('data-state', 'checked');
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();
    expect(container.querySelector('[role="combobox"]')).toHaveAttribute('aria-expanded', 'true');

    await waitFor(() => {
      expect(document.body.querySelector('[role="tooltip"]')).not.toBeNull();
      expect(document.body.querySelectorAll('[role="dialog"]').length).toBeGreaterThanOrEqual(2);
      expect(document.body.querySelector('[role="option"]')).toHaveAttribute('aria-selected', 'true');
    });

    await React.act(async () => {
      root?.unmount();
      await Promise.resolve();
    });
    container.remove();
    errorSpy.mockRestore();
  });

  it('keeps Dialog asChild trigger refs, event composition, and behavior intact', async () => {
    const triggerRef = React.createRef<HTMLAnchorElement>();
    const onTriggerClick = vi.fn();

    render(
      <Dialog>
        <Dialog.Trigger
          asChild
          ref={triggerRef as unknown as React.Ref<HTMLButtonElement>}
          onClick={onTriggerClick}
        >
          <a href="#dialog">Open as link</a>
        </Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Title>asChild dialog</Dialog.Title>
        </Dialog.Content>
      </Dialog>
    );

    fireEvent.click(screen.getByRole('link', { name: 'Open as link' }));

    expect(onTriggerClick).toHaveBeenCalledTimes(1);
    expect(triggerRef.current?.tagName).toBe('A');
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('asChild dialog'));
  });

  it('keeps component APIs stable under React StrictMode double invocation', async () => {
    render(
      <React.StrictMode>
        <Dialog>
          <Dialog.Trigger>Open strict dialog</Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Title>Strict dialog body</Dialog.Title>
          </Dialog.Content>
        </Dialog>
      </React.StrictMode>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open strict dialog' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveTextContent('Strict dialog body');
    });
  });
});
