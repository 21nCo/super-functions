<script lang="ts">
  import type { TableProps } from '@uifn/core/primitives/table';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { TableDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<TableProps, 'div'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={TableDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
