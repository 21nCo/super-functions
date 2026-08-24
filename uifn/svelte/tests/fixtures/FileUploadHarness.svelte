<script lang="ts">
  import type { UIFnFileDescriptor } from '@uifn/core/primitives/file-upload';
  import { FileUpload } from '../../lib/index.js';

  let { files = $bindable([]) }: { files?: readonly UIFnFileDescriptor[] } = $props();
</script>

<FileUpload.Root multiple bind:files>
  <FileUpload.Label>Evidence</FileUpload.Label>
  <FileUpload.Trigger>Choose files</FileUpload.Trigger>
  <FileUpload.Input data-testid="file-upload-input" />
  <FileUpload.Status />
</FileUpload.Root>
<output data-testid="file-upload-files">{JSON.stringify(files.map(({ name, size, type }) => ({ name, size, type })))}</output>
