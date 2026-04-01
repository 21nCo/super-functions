import {
  mount,
  unmount,
  type Component,
  type MountOptions,
} from 'svelte';

const mountedPages = new WeakMap<Element, Record<string, any>>();

export interface SveltePageMountOptions<
  Props extends Record<string, unknown> = Record<string, unknown>,
> {
  mountId?: string;
  props?: Props;
}

export function mountSveltePage<
  Props extends Record<string, unknown>,
  Exports extends Record<string, unknown>,
>(
  component: Component<Props, Exports, any>,
  options: SveltePageMountOptions<Props> = {}
): void {
  const mountId = options.mountId ?? 'app';
  const target = document.getElementById(mountId);

  if (!target) {
    throw new Error(`Missing Svelte page mount target: #${mountId}`);
  }

  const existingMount = mountedPages.get(target);
  if (existingMount) {
    void unmount(existingMount);
  }

  const mounted = mount(component, createMountOptions(target, options.props));
  mountedPages.set(target, mounted as Record<string, any>);
}

function createMountOptions<Props extends Record<string, unknown>>(
  target: HTMLElement,
  props: Props | undefined
): MountOptions<Props> {
  return (props === undefined ? { target } : { target, props }) as MountOptions<Props>;
}
