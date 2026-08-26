<script lang="ts">
  import { onDestroy, setContext, untrack } from 'svelte';
  import type { UIFnEnvironment } from '@uifn/core';
  import {
    SveltePrimitiveBridge,
    splitSvelteRootProps,
    type AnyRecord,
    type SvelteElementName,
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
    element: SvelteElementName;
    props?: AnyRecord;
    children?: import('svelte').Snippet;
    render?: import('svelte').Snippet<[SveltePrimitiveRenderPayload]>;
    ref?: HTMLElement | SVGElement | null;
  }

  let {
    definition,
    element,
    props: runtimeProps = {},
    children,
    render,
    ref = $bindable(null),
  }: Props = $props();

  const instanceId = $props.id();
  const initialDefinition = untrack(() => definition);
  const inputNames = initialDefinition.name === 'AngleSlider'
    ? [...initialDefinition.inputNames, 'name']
    : initialDefinition.inputNames;
  const initial = splitSvelteRootProps(untrack(() => runtimeProps), inputNames);
  const environment: UIFnEnvironment = {
    ...initial.environment,
    scopeId: initial.environment?.scopeId ?? `${initialDefinition.name}-${instanceId}`,
    hydrationSeed: initial.environment?.hydrationSeed ?? instanceId,
  };
  const bridge = new SveltePrimitiveBridge(initialDefinition, initial.inputs, environment);
  if (typeof globalThis.document !== 'undefined') bridge.connect();
  setContext(initialDefinition.contextKey, bridge);

  let epoch = $state(0);
  const split = $derived(splitSvelteRootProps(runtimeProps, inputNames));
  const userProps = $derived(toSvelteUserPartProps(split.dom));
  const partProps = $derived.by(() => {
    epoch;
    return bridge.getPartProps(initialDefinition.rootPart, undefined, userProps);
  });
  const spreadProps = $derived(toSvelteSpreadProps(partProps));
  // Textareas carry their value through the native value property. Rendering
  // child snippet markers inside them produces escaped SSR text and a
  // guaranteed hydration mismatch.
  const childlessElement = $derived(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'textarea', 'track', 'wbr'].includes(element));
  const action = createSveltePartAction((node) => {
    bridge.registerElement(initialDefinition.rootPart, undefined, node as HTMLElement | null);
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

  $effect(() => {
    bridge.update(split.inputs);
  });

  onDestroy(() => bridge.destroy());
</script>

{#if render}
  {@render render(payload)}
{:else}
  {#if childlessElement}
    <svelte:element this={element} {...spreadProps} use:action={partProps} bind:this={ref} />
  {:else}
    <svelte:element this={element} {...spreadProps} use:action={partProps} bind:this={ref}>
      {@render children?.()}
    </svelte:element>
  {/if}
{/if}
