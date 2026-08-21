<script lang="ts">
  import type { FileUploadProps } from '@uifn/core/primitives/file-upload';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { FileUploadDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<FileUploadProps, 'div'> & { files?: Parameters<NonNullable<FileUploadProps['onFilesChange']>>[0] };
  let { files = $bindable(), onFilesChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleFilesChange = (next: Parameters<NonNullable<FileUploadProps['onFilesChange']>>[0]) => {
    files = next;
    onFilesChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, files, onFilesChange: handleFilesChange });
</script>

<PrimitiveRoot
  definition={FileUploadDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
