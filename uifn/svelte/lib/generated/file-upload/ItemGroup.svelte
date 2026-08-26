<script lang="ts">
  import type { FileUploadController } from '@uifn/core/primitives/file-upload';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { FileUploadDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<FileUploadController['parts']['itemGroup'], 'ul', false>;
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
  definition={FileUploadDefinition}
  part="itemGroup"
  element="ul"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
