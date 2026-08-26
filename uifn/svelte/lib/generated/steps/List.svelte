<script lang="ts">
  import type { StepsController } from '@uifn/core/primitives/steps';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { StepsDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<StepsController['parts']['list'], 'ol', false>;
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
  definition={StepsDefinition}
  part="list"
  element="ol"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
