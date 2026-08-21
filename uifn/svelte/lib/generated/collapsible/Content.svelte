<script lang="ts">
  import type { CollapsibleController } from '@uifn/core/primitives/collapsible';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { CollapsibleDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<CollapsibleController['parts']['content'], 'div', false>;
  let {
    value,
    forceMount = false,
    container,
    children,
    render,
    ref = $bindable(null),
    ...rest
  }: Props = $props();
</script>

<PrimitivePart
  definition={CollapsibleDefinition}
  part="content"
  element="div"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
