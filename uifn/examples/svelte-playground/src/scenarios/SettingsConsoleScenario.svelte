<script lang="ts">
  import {
    Checkbox,
    CheckboxIndicator,
    Dialog,
    DialogClose,
    DialogContent,
    DialogBackdrop,
    DialogPortal,
    DialogTrigger,
    Switch,
    SwitchThumb,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    ToastClose,
    ToastDescription,
    ToastProvider,
    ToastRoot,
    ToastTitle,
  } from "@uifn/svelte";
  import { settingsSections, settingsToggles, type ExampleRouteHash } from "@uifn/examples-shared";

  export let route: ExampleRouteHash;

  let dialogOpen = false;
  let toastOpen = false;
  let switchStates = Object.fromEntries(
    settingsToggles.map((toggle) => [toggle.id, toggle.defaultEnabled]),
  ) as Record<string, boolean>;
  let checkboxStates: Record<string, boolean> = {
    general: true,
    notifications: false,
    security: true,
  };

  function updateSwitch(toggleId: string, checked: boolean) {
    switchStates = {
      ...switchStates,
      [toggleId]: checked,
    };
  }

  function updateSection(sectionId: string, checked: boolean | "indeterminate") {
    checkboxStates = {
      ...checkboxStates,
      [sectionId]: checked === true,
    };
  }

  function applySettings() {
    dialogOpen = false;
    toastOpen = true;
  }
</script>

<ToastProvider
  class="toast-viewport"
  toasts={toastOpen
    ? [
        {
          id: "preferences-saved",
          title: "Preferences saved",
          description: "The shared example state updated without any remote request or environment setup.",
          duration: 3500,
        },
      ]
    : []}
  duration={3500}
  onDismiss={() => (toastOpen = false)}
>
  <div class="scenario-stack" data-route={route}>
    <div class="scenario-toolbar">
      <Dialog open={dialogOpen} onOpenChange={(open) => (dialogOpen = open)}>
        <DialogTrigger class="primary-button">Open settings console</DialogTrigger>
        <DialogPortal>
          <DialogBackdrop class="dialog-overlay" />
          <DialogContent
            class="dialog-content"
            aria-labelledby="settings-dialog-title"
            aria-describedby="settings-dialog-description"
          >
            <div class="dialog-header">
              <div>
                <h3 id="settings-dialog-title">Workspace settings</h3>
                <p id="settings-dialog-description" class="scenario-description">
                  Review defaults, notification rules, and approval prompts.
                </p>
              </div>
              <DialogClose class="ghost-button">Dismiss</DialogClose>
            </div>

            <Tabs defaultValue={settingsSections[0]?.id ?? "general"}>
              <TabsList class="tabs-list" aria-label="Settings sections">
                {#each settingsSections as section (section.id)}
                  <TabsTrigger class="tab-trigger" value={section.id}>
                    {section.title}
                  </TabsTrigger>
                {/each}
              </TabsList>

              {#each settingsSections as section (section.id)}
                <TabsContent class="tab-panel" value={section.id}>
                  <div class="section-intro">
                    <div>
                      <h4>{section.title}</h4>
                      <p>{section.description}</p>
                    </div>

                    <label class="checkbox-row">
                      <span>
                        Include in saved preset
                        <small>Keep this section in your portable team profile.</small>
                      </span>
                      <Checkbox
                        class="checkbox-root"
                        checked={checkboxStates[section.id]}
                        onCheckedChange={(checked) => updateSection(section.id, checked)}
                        aria-label={`Include ${section.title} in saved preset`}
                      >
                        <CheckboxIndicator class="checkbox-indicator">✓</CheckboxIndicator>
                      </Checkbox>
                    </label>
                  </div>

                  <div class="control-list">
                    {#each settingsToggles.filter((toggle) => toggle.sectionId === section.id) as toggle (toggle.id)}
                      <div class="control-row">
                        <span>
                          <strong>{toggle.label}</strong>
                          <small>{toggle.description}</small>
                        </span>
                        <Switch
                          class="switch-root"
                          checked={switchStates[toggle.id]}
                          onCheckedChange={(checked) => updateSwitch(toggle.id, checked)}
                          aria-label={toggle.label}
                        >
                          <SwitchThumb class="switch-thumb" />
                        </Switch>
                      </div>
                    {/each}
                  </div>
                </TabsContent>
              {/each}
            </Tabs>

            <div class="dialog-actions">
              <DialogClose class="ghost-button">Cancel</DialogClose>
              <button class="primary-button" type="button" on:click={applySettings}>
                Apply settings
              </button>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>

      <div class="scenario-note">
        <strong>Why this example matters</strong>
        <p>
          The settings console demonstrates modal layering, tabbed sections, explicit labels, and
          deterministic feedback after saving.
        </p>
      </div>
    </div>

    {#if toastOpen}
      <ToastRoot value="preferences-saved" class="toast-card">
        <ToastTitle value="preferences-saved">Preferences saved</ToastTitle>
        <ToastDescription value="preferences-saved">
          The shared example state updated without any remote request or environment setup.
        </ToastDescription>
        <ToastClose value="preferences-saved" class="toast-close">Close</ToastClose>
      </ToastRoot>
    {/if}
  </div>
</ToastProvider>
