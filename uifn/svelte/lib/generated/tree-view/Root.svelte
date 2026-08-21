<script lang="ts">
  import type { TreeViewProps } from '@uifn/core/primitives/tree-view';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { TreeViewDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<TreeViewProps, 'div'>;
  let { expanded = $bindable(), selection = $bindable(), onExpandedChange, onSelectionChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleExpandedChange = (next: Parameters<NonNullable<TreeViewProps['onExpandedChange']>>[0]) => {
    expanded = next;
    onExpandedChange?.(next);
  };
  const handleSelectionChange = (next: Parameters<NonNullable<TreeViewProps['onSelectionChange']>>[0]) => {
    selection = next;
    onSelectionChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, expanded, selection, onExpandedChange: handleExpandedChange, onSelectionChange: handleSelectionChange });
</script>

<PrimitiveRoot
  definition={TreeViewDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
