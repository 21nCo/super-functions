<script lang="ts">
  import type { ImageCropperController } from '@uifn/core/primitives/image-cropper';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { ImageCropperDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<ImageCropperController['parts']['handle'], 'div', true>;
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
  definition={ImageCropperDefinition}
  part="handle"
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
