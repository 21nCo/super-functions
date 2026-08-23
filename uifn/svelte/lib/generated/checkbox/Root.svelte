<script lang="ts">
  import type { CheckboxProps } from '@uifn/core/primitives/checkbox';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { CheckboxDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<CheckboxProps, 'label'>;
  let { checked = $bindable(), onCheckedChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleCheckedChange = (next: Parameters<NonNullable<CheckboxProps['onCheckedChange']>>[0]) => {
    checked = next;
    onCheckedChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, checked, onCheckedChange: handleCheckedChange });
</script>

<PrimitiveRoot
  definition={CheckboxDefinition}
  element="label"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
