import {
  mount,
  unmount,
  type Component,
  type MountOptions,
} from 'svelte';

const mountedContent = new WeakMap<Element | ShadowRoot, Record<string, any>>();

export interface SvelteContentMountOptions<
  Props extends Record<string, unknown> = Record<string, unknown>,
> {
  props?: Props;
}

export interface SvelteContentMountHandle {
  destroy(): void;
}

export function mountSvelteContent<
  Props extends Record<string, unknown>,
  Exports extends Record<string, unknown>,
>(
  component: Component<Props, Exports, any>,
  target: Element | ShadowRoot,
  options: SvelteContentMountOptions<Props> = {}
): SvelteContentMountHandle {
  const existingMount = mountedContent.get(target);
  if (existingMount) {
    void unmount(existingMount);
  }

  const mounted = mount(component, createMountOptions(target, options.props));
  mountedContent.set(target, mounted as Record<string, any>);

  return {
    destroy() {
      const current = mountedContent.get(target);
      if (current) {
        mountedContent.delete(target);
        void unmount(current);
      }
    },
  };
}

function createMountOptions<Props extends Record<string, unknown>>(
  target: Element | ShadowRoot,
  props: Props | undefined
): MountOptions<Props> {
  return (props === undefined ? { target } : { target, props }) as MountOptions<Props>;
}
