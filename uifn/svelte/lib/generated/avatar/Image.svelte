<script lang="ts">
  import type { AvatarContractParts } from '@uifn/core/primitives/avatar';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { AvatarDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<AvatarContractParts['image'], 'img', false>;
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
  definition={AvatarDefinition}
  part="image"
  element="img"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
