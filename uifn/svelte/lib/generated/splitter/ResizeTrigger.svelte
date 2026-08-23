<script lang="ts">
  import type { SplitterController } from '@uifn/core/primitives/splitter';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { SplitterDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<SplitterController['parts']['resizeTrigger'], 'div', true>;
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
  definition={SplitterDefinition}
  part="resizeTrigger"
  element="div"
  many={true}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
