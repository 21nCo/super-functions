<script lang="ts">
  import { Menubar } from '../../lib/index.js';

  const items = [
    { id: 'file', label: 'File' },
    { id: 'new', label: 'New file', parentId: 'file' },
    { id: 'save', label: 'Save', parentId: 'file' },
  ];
</script>

<Menubar.Root {items} aria-label="Project commands">
  <Menubar.Menu value="file">
    <Menubar.Trigger value="file">File</Menubar.Trigger>
    <Menubar.Content value="file" data-testid="menubar-content">
      <Menubar.Item value="new">New file</Menubar.Item>
      <Menubar.Item value="save">Save</Menubar.Item>
    </Menubar.Content>
  </Menubar.Menu>
</Menubar.Root>
