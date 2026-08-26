<script lang="ts">
  import type { EditableProps } from '@uifn/core/primitives/editable';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { EditableDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<EditableProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<EditableProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={EditableDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
