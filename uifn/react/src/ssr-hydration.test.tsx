import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem } from './combobox';
import { Dialog, DialogContent, DialogPortal, DialogTitle, DialogTrigger } from './dialog';
import { Select, SelectContent, SelectItem, SelectTrigger } from './select';
import { Portal } from './portal';

const INSTANCE_COUNT = 3;

function MultiInstanceFixture() {
  return (
    <div>
      {Array.from({ length: INSTANCE_COUNT }, (_, index) => {
        const item = index + 1;
        return (
          <section key={item}>
            <Dialog defaultOpen>
              <DialogTrigger>Open dialog {item}</DialogTrigger>
              <DialogPortal>
                <DialogContent>
                  <DialogTitle>SSR Dialog {item}</DialogTitle>
                </DialogContent>
              </DialogPortal>
            </Dialog>

            <Select defaultOpen defaultValue={`option-${item}`}>
              <SelectTrigger>Select {item}</SelectTrigger>
              <SelectContent>
                <SelectItem value={`option-${item}`}>Option {item}</SelectItem>
              </SelectContent>
            </Select>

            <Combobox
              defaultOpen
              defaultValue={`choice-${item}`}
              defaultInputValue={`choice-${item}`}
            >
              <ComboboxInput aria-label={`Combobox ${item}`} />
              <ComboboxContent>
                <ComboboxItem value={`choice-${item}`}>Choice {item}</ComboboxItem>
              </ComboboxContent>
            </Combobox>
          </section>
        );
      })}
    </div>
  );
}

function expectUniqueResolvedIds(elements: Element[]) {
  const ids = elements.map((element) => element.getAttribute('aria-controls'));

  expect(ids).not.toContain(null);
  expect(new Set(ids).size).toBe(ids.length);

  ids.forEach((id) => {
    expect(document.getElementById(id as string)).not.toBeNull();
  });
}

describe('SSR and hydration safety', () => {
  it('hydrates Dialog, Select, and Combobox instances without warnings or duplicate IDs', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const html = renderToString(<MultiInstanceFixture />);
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    let root: ReturnType<typeof hydrateRoot> | undefined;

    await React.act(async () => {
      root = hydrateRoot(container, <MultiInstanceFixture />);
      await Promise.resolve();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    const hydrationErrors = errorSpy.mock.calls.filter(([message]) => {
      return (
        typeof message === 'string' &&
        !message.includes('useLayoutEffect does nothing on the server')
      );
    });
    expect(hydrationErrors).toHaveLength(0);

    expectUniqueResolvedIds([
      ...Array.from(container.querySelectorAll('button[aria-haspopup="dialog"]')),
      ...Array.from(container.querySelectorAll('button[role="combobox"]')),
      ...Array.from(container.querySelectorAll('input[role="combobox"]')),
    ]);

    await React.act(async () => {
      root?.unmount();
      await Promise.resolve();
    });

    errorSpy.mockRestore();
    document.body.removeChild(container);
  });

  it('mounts portal descendants only once during hydration', async () => {
    const lifecycle = vi.fn();
    function Probe() {
      React.useEffect(() => {
        lifecycle('mount');
        return () => lifecycle('unmount');
      }, []);
      return <div data-portal-probe />;
    }

    const fixture = <Portal><Probe /></Portal>;
    const container = document.createElement('div');
    container.innerHTML = renderToString(fixture);
    document.body.appendChild(container);

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await React.act(async () => {
      root = hydrateRoot(container, fixture);
      await Promise.resolve();
    });

    expect(lifecycle.mock.calls).toEqual([['mount']]);
    expect(container.querySelector('[data-portal-probe]')).toBeNull();
    expect(document.body.querySelector('[data-portal-probe]')).not.toBeNull();

    await React.act(async () => {
      root?.unmount();
      await Promise.resolve();
    });
    expect(lifecycle.mock.calls).toEqual([['mount'], ['unmount']]);
    document.body.removeChild(container);
  });
});
