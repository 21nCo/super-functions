<script lang="ts">
  import type { SwitchProps } from '@uifn/core/primitives/switch';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { SwitchDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<SwitchProps, 'label'>;
  let { checked = $bindable(), onCheckedChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleCheckedChange = (next: Parameters<NonNullable<SwitchProps['onCheckedChange']>>[0]) => {
    checked = next;
    onCheckedChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, checked, onCheckedChange: handleCheckedChange });
</script>

<PrimitiveRoot
  definition={SwitchDefinition}
  element="label"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
