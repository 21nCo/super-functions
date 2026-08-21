<script lang="ts">
  import type { TagsInputProps } from '@uifn/core/primitives/tags-input';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { TagsInputDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<TagsInputProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<TagsInputProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={TagsInputDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
