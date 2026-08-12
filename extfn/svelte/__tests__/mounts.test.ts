import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mountMock, unmountMock } = vi.hoisted(() => {
  const mountMock = vi.fn(
    (
      _component,
      options?: { target?: Element | ShadowRoot; props?: Record<string, unknown> }
    ) => {
      const target = options?.target;
      if (target instanceof ShadowRoot) {
        target.innerHTML = `<div data-mounted="shadow">${options?.props?.label ?? ''}</div>`;
      } else if (target instanceof Element) {
        target.innerHTML = `<div data-mounted="page">${options?.props?.title ?? ''}</div>`;
      }

      return {
        target,
      };
    }
  );

  const unmountMock = vi.fn(async (mounted?: { target?: Element | ShadowRoot }) => {
    const target = mounted?.target;
    if (target instanceof ShadowRoot || target instanceof Element) {
      target.innerHTML = '';
    }
  });

  return {
    mountMock,
    unmountMock,
  };
});

vi.mock('svelte', () => ({
  mount: mountMock,
  unmount: unmountMock,
}));

import { mountSvelteContent, mountSveltePage } from '../src/index.js';

describe('@extfn/svelte mounts', () => {
  beforeEach(() => {
    mountMock.mockClear();
    unmountMock.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts a Svelte page into the default app target and remounts cleanly', () => {
    document.body.innerHTML = '<div id="app"></div>';

    mountSveltePage({} as never, {
      props: {
        title: 'First mount',
      },
    });

    expect(document.querySelector('[data-mounted="page"]')?.textContent).toContain(
      'First mount'
    );

    mountSveltePage({} as never, {
      props: {
        title: 'Second mount',
      },
    });

    expect(mountMock).toHaveBeenCalledTimes(2);
    expect(unmountMock).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('[data-mounted="page"]')).toHaveLength(1);
    expect(document.querySelector('[data-mounted="page"]')?.textContent).toContain(
      'Second mount'
    );
  });

  it('mounts and destroys content inside a shadow root', async () => {
    const host = document.createElement('div');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    document.body.append(host);

    const mounted = mountSvelteContent({} as never, shadowRoot, {
      props: {
        label: 'Shadow content',
      },
    });

    expect(mountMock).toHaveBeenCalledTimes(1);
    expect(shadowRoot.querySelector('[data-mounted="shadow"]')?.textContent).toContain(
      'Shadow content'
    );

    mounted.destroy();
    await Promise.resolve();

    expect(unmountMock).toHaveBeenCalledTimes(1);
    expect(shadowRoot.querySelector('[data-mounted="shadow"]')).toBeNull();
  });
});
