<script lang="ts">
  import {
    Combobox,
    ComboboxContent,
    ComboboxInput,
    ComboboxItem,
    ComboboxItemIndicator,
    ComboboxTrigger,
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
    ScrollArea,
    ScrollAreaCorner,
    ScrollAreaScrollbar,
    ScrollAreaThumb,
    ScrollAreaViewport,
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectTrigger,
    SelectValue,
    SelectViewport,
  } from "@uifn/svelte";
  import { commandItems, type CommandItemFixture, type ExampleRouteHash } from "@uifn/examples-shared";

  export let route: ExampleRouteHash;

  const groupOptions = [
    { value: "all", label: "All groups" },
    { value: "Navigation", label: "Navigation" },
    { value: "Creation", label: "Creation" },
    { value: "Maintenance", label: "Maintenance" },
  ] as const;

  let query = "";
  let selectedGroup = "all";
  let selectedCommandTitle = "";

  $: filteredCommands = commandItems.filter((command) => {
    const queryMatch = command.title.toLowerCase().includes(query.toLowerCase());
    const groupMatch = selectedGroup === "all" || command.group === selectedGroup;
    return queryMatch && groupMatch;
  });

  $: activeCommand =
    filteredCommands.find((command) => command.title === selectedCommandTitle) ??
    filteredCommands[0] ??
    commandItems[0];

  function handleGroupChange(value: string) {
    selectedGroup = value;
  }

  function handleCommandValueChange(value: string) {
    selectedCommandTitle = value;
  }

  function getCommandTone(command: CommandItemFixture) {
    if (command.group === "Navigation") return "tone-navigation";
    if (command.group === "Creation") return "tone-creation";
    return "tone-maintenance";
  }
</script>

<div class="scenario-stack" data-route={route}>
  <div class="command-grid">
    <section class="command-panel">
      <div class="field-group">
        <label class="field-label" for="command-search">
          Search commands
          <small>Filter the shared command fixture with the Svelte combobox.</small>
        </label>
        <Combobox
          inputValue={query}
          onValueChange={handleCommandValueChange}
          onInputValueChange={(value) => (query = value)}
        >
          <div class="inline-field">
            <ComboboxInput
              id="command-search"
              class="text-input"
              placeholder="Search commands"
              aria-label="Search commands"
            />
            <ComboboxTrigger class="ghost-button" aria-label="Toggle command suggestions">
              Browse
            </ComboboxTrigger>
          </div>
          <ComboboxContent class="floating-card command-menu">
            {#each filteredCommands as command (command.id)}
              <ComboboxItem class="command-option" value={command.title}>
                <span>{command.title}</span>
                <ComboboxItemIndicator>Selected</ComboboxItemIndicator>
              </ComboboxItem>
            {/each}
          </ComboboxContent>
        </Combobox>
      </div>

      <div class="field-group">
        <label class="field-label" for="command-group-trigger">
          Command group
          <small>Keep the scenario deterministic by filtering the local fixture set only.</small>
        </label>
        <Select onValueChange={handleGroupChange}>
          <SelectTrigger
            id="command-group-trigger"
            class="select-trigger"
            aria-label="Filter command group"
          >
            <SelectValue placeholder="Filter command group" />
          </SelectTrigger>
          <SelectContent class="floating-card command-menu">
            <SelectViewport>
              {#each groupOptions as option (option.value)}
                <SelectItem value={option.value} class="command-option">
                  {option.label}
                  <SelectItemIndicator>Selected</SelectItemIndicator>
                </SelectItem>
              {/each}
            </SelectViewport>
          </SelectContent>
        </Select>
      </div>
    </section>

    <section class="results-shell">
      <div class="results-summary">
        <div>
          <p class="section-label">Active command</p>
          <h3>{activeCommand?.title ?? "No command found"}</h3>
        </div>
        {#if activeCommand}
          <p class={`status-chip ${getCommandTone(activeCommand)}`}>{activeCommand.group}</p>
        {/if}
      </div>

      <ScrollArea class="command-scroll">
        <ScrollAreaViewport class="command-scroll-viewport">
          <div class="command-list">
            {#each filteredCommands as command (command.id)}
              <ContextMenu>
                <ContextMenuTrigger class="command-card-trigger">
                  <button type="button" class="command-card" aria-label={`Command ${command.title}`}>
                    <div>
                      <strong>{command.title}</strong>
                      <p>{command.group}</p>
                    </div>
                    <code>{command.shortcut}</code>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent class="floating-card">
                  <ContextMenuItem>Run command</ContextMenuItem>
                  <ContextMenuItem>Copy shortcut</ContextMenuItem>
                  <ContextMenuItem>Pin to palette</ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            {/each}
          </div>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar orientation="vertical" class="scrollbar">
          <ScrollAreaThumb class="scrollbar-thumb" />
        </ScrollAreaScrollbar>
        <ScrollAreaCorner />
      </ScrollArea>
    </section>
  </div>
</div>
