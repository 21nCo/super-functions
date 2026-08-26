<script lang="ts">
  import type { PaginationProps } from '@uifn/core/primitives/pagination';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { PaginationDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<PaginationProps, 'nav'>;
  let { page = $bindable(), onPageChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handlePageChange = (next: Parameters<NonNullable<PaginationProps['onPageChange']>>[0]) => {
    page = next;
    onPageChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, page, onPageChange: handlePageChange });
</script>

<PrimitiveRoot
  definition={PaginationDefinition}
  element="nav"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
