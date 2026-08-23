<script lang="ts">
  import type { ImageCropperProps } from '@uifn/core/primitives/image-cropper';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { ImageCropperDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<ImageCropperProps, 'div'>;
  let { crop = $bindable(), onCropChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleCropChange = (next: Parameters<NonNullable<ImageCropperProps['onCropChange']>>[0]) => {
    crop = next;
    onCropChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, crop, onCropChange: handleCropChange });
</script>

<PrimitiveRoot
  definition={ImageCropperDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
