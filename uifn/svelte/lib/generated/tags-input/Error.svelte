<script lang="ts">
  import type { TagsInputController } from '@uifn/core/primitives/tags-input';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { TagsInputDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<TagsInputController['parts']['error'], 'div', false>;
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
  definition={TagsInputDefinition}
  part="error"
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
