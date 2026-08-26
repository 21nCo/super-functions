<script lang="ts">
  import { getContext, untrack } from 'svelte';
  import { resolveUIFnDefaultPartContent } from '@uifn/core/parts';
  import {
    type AnyRecord,
    type SvelteElementName,
    type SveltePrimitiveBridge,
    type SveltePrimitiveDefinition,
    type SveltePrimitiveRenderPayload,
  } from './compound.js';
  import {
    createSveltePartAction,
    toSvelteSpreadProps,
    toSvelteUserPartProps,
  } from './props.js';

  interface Props {
    definition: SveltePrimitiveDefinition<any>;
    part: string;
    element: SvelteElementName;
    many: boolean;
    props?: AnyRecord;
    value?: unknown;
    forceMount?: boolean;
    container?: import('@uifn/dom').UIFnPortalTarget;
    children?: import('svelte').Snippet;
    render?: import('svelte').Snippet<[SveltePrimitiveRenderPayload]>;
    ref?: HTMLElement | SVGElement | null;
  }

  let {
    definition,
    part,
    element,
    many,
    props = {},
    value,
    forceMount = false,
    container,
    children,
    render,
    ref = $bindable(null),
  }: Props = $props();

  const initialDefinition = untrack(() => definition);
  const initialPart = untrack(() => part);
  const bridge = getContext<SveltePrimitiveBridge<any> | undefined>(initialDefinition.contextKey);
  if (!bridge) {
    throw new TypeError(`${initialDefinition.name}.${initialPart} MUST be rendered inside ${initialDefinition.name}.Root.`);
  }

  let epoch = $state(0);
  const userProps = $derived(toSvelteUserPartProps(props));
  const partProps = $derived.by(() => {
    epoch;
    if (many && value === undefined) {
      throw new TypeError(`${initialDefinition.name}.${initialPart} requires a value prop.`);
    }
    const projected = bridge.getPartProps(part, many ? value : undefined, userProps);
    if (!forceMount || projected.hidden === undefined) return projected;
    const forced = { ...projected };
    delete forced.hidden;
    return forced;
  });
  const spreadProps = $derived(toSvelteSpreadProps(partProps));
  const fallbackContent = $derived.by(() => {
    epoch;
    return children === undefined
      ? resolveUIFnDefaultPartContent(
        initialDefinition.name,
        initialPart,
        bridge.getSnapshot().state,
      )
      : undefined;
  });
  // Textareas are not HTML void elements, but their value must not be
  // represented by Svelte child/slot hydration markers. UIFn projects their
  // value through native attributes/properties instead.
  const childlessElement = $derived(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'textarea', 'track', 'wbr'].includes(element));
  const action = createSveltePartAction((node) => {
    bridge.registerElement(
      part,
      many ? value : undefined,
      node as HTMLElement | null,
      part === 'portal' ? container : undefined,
    );
  }, () => bridge.notifyDomCommit());
  const payload = $derived.by((): SveltePrimitiveRenderPayload => {
    epoch;
    return {
      props: spreadProps,
      action,
      actionParams: partProps,
      state: bridge.getSnapshot().state,
      actions: bridge.getActions(),
      status: bridge.getStatus(),
      bridge,
    };
  });

  $effect(() => bridge.subscribe(() => {
    untrack(() => {
      epoch += 1;
    });
  }));
</script>

{#if render}
  {@render render(payload)}
{:else}
  {#if childlessElement}
    <svelte:element this={element} {...spreadProps} use:action={partProps} bind:this={ref} />
  {:else}
    <svelte:element this={element} {...spreadProps} use:action={partProps} bind:this={ref}>
      {@render children?.()}
      {#if fallbackContent && typeof fallbackContent === 'object' && fallbackContent.kind === 'svg-path'}
        <path d={fallbackContent.d} fill="currentColor"></path>
      {:else}
        {fallbackContent ?? ''}
      {/if}
    </svelte:element>
  {/if}
{/if}
