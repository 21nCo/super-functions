<script lang="ts">
  import { Checkbox, Dialog } from '../../lib/index.js';

  let checked = $state(false);
</script>

<form data-testid="form">
  <Checkbox.Root name="terms" value="accepted" required bind:checked>
    <Checkbox.Control data-testid="checkbox-control">
      <Checkbox.Indicator>✓</Checkbox.Indicator>
    </Checkbox.Control>
    <Checkbox.Label>Accept</Checkbox.Label>
    <Checkbox.HiddenInput />
  </Checkbox.Root>
</form>
<output data-testid="checked-value">{String(checked)}</output>

<Dialog.Root defaultOpen>
  <Dialog.Trigger>Open dialog</Dialog.Trigger>
  <Dialog.Portal data-testid="dialog-portal">
    <Dialog.Backdrop />
    <Dialog.Positioner>
      <Dialog.Content aria-label="Confirmation" data-testid="dialog-content">
        <Dialog.Title>Confirmation</Dialog.Title>
        <Dialog.Description>Confirm this action.</Dialog.Description>
        <Dialog.Close>Close</Dialog.Close>
      </Dialog.Content>
    </Dialog.Positioner>
  </Dialog.Portal>
</Dialog.Root>
