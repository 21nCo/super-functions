<script lang="ts">
  import { Button, ButtonIcon, ButtonLabel } from "@uifn/components-svelte/button";
  import {
    catalogDeploymentRows,
    catalogDemoChildren,
    catalogDemoPartInstances,
    catalogDemoPartProps,
    catalogDemoPartText,
    catalogDemoRootText,
    catalogDemoShouldAddFallbackText,
    catalogDemoRootPropsForRoute,
    getCatalogComponentDemo,
    type CatalogDemoPart,
    type ComponentSlug,
    type WorkbenchRoute,
  } from "@uifn/examples-shared";
  import { svelteComponentLoaders } from "./component-loaders";

  let {
    slug,
    route,
  }: {
    slug: ComponentSlug;
    route: WorkbenchRoute;
  } = $props();

  const demo = $derived(getCatalogComponentDemo(slug));
  const rootProps = $derived(catalogDemoRootPropsForRoute(slug, route));
  const componentModule = $derived(svelteComponentLoaders[slug]());
  let tagsValue = $state(["item-1", "item-2"]);
  let tableQuery = $state("");
  let tablePage = $state(0);
  let selectedDeployments = $state<string[]>([]);
  const tablePageSize = 4;
  const filteredDeployments = $derived(catalogDeploymentRows.filter((row) => (
    `${row.environment} ${row.release} ${row.status} ${row.region}`.toLowerCase().includes(tableQuery.toLowerCase())
  )));
  const tablePageCount = $derived(Math.max(1, Math.ceil(filteredDeployments.length / tablePageSize)));
  const safeTablePage = $derived(Math.min(tablePage, tablePageCount - 1));
  const visibleDeployments = $derived(filteredDeployments.slice(safeTablePage * tablePageSize, (safeTablePage + 1) * tablePageSize));
  const allVisibleDeploymentsSelected = $derived(visibleDeployments.length > 0 && visibleDeployments.every((row) => selectedDeployments.includes(row.id)));
  function toggleDeployment(id: string, checked: boolean) {
    selectedDeployments = checked
      ? [...new Set([...selectedDeployments, id])]
      : selectedDeployments.filter((candidate) => candidate !== id);
  }
  function toggleVisibleDeployments(checked: boolean) {
    const visible = new Set(visibleDeployments.map((row) => row.id));
    selectedDeployments = checked
      ? [...new Set([...selectedDeployments, ...visible])]
      : selectedDeployments.filter((candidate) => !visible.has(candidate));
  }
  const july2026Rows = Array.from({ length: 6 }, (_, row) => (
    Array.from({ length: 7 }, (_, column) => {
      const value = new Date(Date.UTC(2026, 5, 28 + row * 7 + column));
      return { key: value.toISOString().slice(0, 10), day: value.getUTCDate() };
    })
  ));
  const colorChannels = [
    { value: "r", label: "Red" },
    { value: "g", label: "Green" },
    { value: "b", label: "Blue" },
    { value: "alpha", label: "Alpha" },
  ];
</script>

{#if slug === "tour"}
  <button id="uifn-tour-target" type="button">Tour target</button>
{/if}

{#snippet renderPart(part: CatalogDemoPart, instanceIndex: number, componentMap: Record<string, any>)}
  {@const Part = componentMap[part.exportName]}
  {@const descendants = catalogDemoChildren(demo, part.id)}
  {@const regularDescendants = descendants.filter((child) => child.element !== "td")}
  {@const cellDescendants = descendants.filter((child) => child.element === "td")}
  {@const text = catalogDemoPartText(slug, part, instanceIndex)}
  {#if Part}
    {#if part.voidElement}
      <Part
        {...catalogDemoPartProps(slug, part, instanceIndex)}
        data-uifn-catalog-anatomy={part.id}
      />
    {:else if (slug === "select" && part.id === "valueText") || (slug === "qr-code" && part.id === "image")}
      <Part
        {...catalogDemoPartProps(slug, part, instanceIndex)}
        data-uifn-catalog-anatomy={part.id}
      />
    {:else}
      <Part
        {...catalogDemoPartProps(slug, part, instanceIndex)}
        data-uifn-catalog-anatomy={part.id}
      >
        {#if text}{text}{/if}
        {#each regularDescendants as child (child.id)}
          {#each catalogDemoPartInstances(child) as ownIndex (`${child.id}-${ownIndex}`)}
            {@const childIndex = child.repeat > 1 ? ownIndex : instanceIndex}
            {@render renderPart(child, childIndex, componentMap)}
          {/each}
        {/each}
        {#if cellDescendants.length}
          <tbody>
            <tr>
              {#each cellDescendants as child (child.id)}
                {#each catalogDemoPartInstances(child) as ownIndex (`${child.id}-${ownIndex}`)}
                  {@const childIndex = child.repeat > 1 ? ownIndex : instanceIndex}
                  {@render renderPart(child, childIndex, componentMap)}
                {/each}
              {/each}
            </tr>
          </tbody>
        {/if}
        {#if !text && descendants.length === 0 && catalogDemoShouldAddFallbackText(slug, part)}
          {part.id} example
        {/if}
      </Part>
    {/if}
  {:else}
    <span data-uifn-demo-missing={part.exportName}>Missing {part.exportName}</span>
  {/if}
{/snippet}

{#await componentModule}
  <article data-uifn-component-loading={slug}>Loading {slug}…</article>
{:then componentMap}
  {@const Root = componentMap[demo.root.exportName]}
  {#if Root}
    {#if slug === "skeleton"}
      {@const SkeletonRoot = componentMap.SkeletonRoot}
      <SkeletonRoot {...rootProps} class="catalog-production-skeleton">
        <span class="catalog-production-skeleton-avatar"></span>
        <span class="catalog-production-skeleton-copy"><i></i><i></i><i></i></span>
      </SkeletonRoot>
    {:else if slug === "breadcrumb"}
      {@const BreadcrumbRoot = componentMap.BreadcrumbRoot}
      {@const BreadcrumbList = componentMap.BreadcrumbList}
      {@const BreadcrumbItem = componentMap.BreadcrumbItem}
      {@const BreadcrumbLink = componentMap.BreadcrumbLink}
      {@const BreadcrumbPage = componentMap.BreadcrumbPage}
      {@const BreadcrumbSeparator = componentMap.BreadcrumbSeparator}
      {@const BreadcrumbEllipsis = componentMap.BreadcrumbEllipsis}
      <BreadcrumbRoot {...rootProps}>
        <BreadcrumbList>
          <BreadcrumbItem value="workspace"><BreadcrumbLink value="workspace" href="#workspace">Workspace</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator value="workspace-projects" />
          <BreadcrumbItem value="collapsed"><BreadcrumbEllipsis /></BreadcrumbItem>
          <BreadcrumbSeparator value="collapsed-projects" />
          <BreadcrumbItem value="projects"><BreadcrumbLink value="projects" href="#projects">Projects</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator value="projects-settings" />
          <BreadcrumbItem value="settings"><BreadcrumbPage>Settings</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </BreadcrumbRoot>
    {:else if slug === "input-group"}
      {@const InputGroupRoot = componentMap.InputGroupRoot}
      {@const InputGroupAddon = componentMap.InputGroupAddon}
      {@const InputGroupText = componentMap.InputGroupText}
      {@const InputGroupControl = componentMap.InputGroupControl}
      {@const InputGroupInput = componentMap.InputGroupInput}
      {@const InputGroupTextarea = componentMap.InputGroupTextarea}
      {@const InputGroupButton = componentMap.InputGroupButton}
      <InputGroupRoot {...rootProps}>
        <InputGroupAddon value="protocol"><InputGroupText value="protocol">https://</InputGroupText></InputGroupAddon>
        <InputGroupControl>
          <InputGroupInput aria-label="Project domain" placeholder="project-name" />
          <InputGroupTextarea hidden aria-label="Project domain notes" />
        </InputGroupControl>
        <InputGroupAddon value="copy"><InputGroupButton value="copy" type="button">Copy</InputGroupButton></InputGroupAddon>
      </InputGroupRoot>
    {:else if slug === "pagination"}
      {@const PaginationRoot = componentMap.PaginationRoot}
      {@const PaginationList = componentMap.PaginationList}
      {@const PaginationItem = componentMap.PaginationItem}
      {@const PaginationPageTrigger = componentMap.PaginationPageTrigger}
      {@const PaginationPrevious = componentMap.PaginationPrevious}
      {@const PaginationNext = componentMap.PaginationNext}
      {@const PaginationEllipsis = componentMap.PaginationEllipsis}
      <PaginationRoot {...rootProps}>
        <PaginationList>
          <li><PaginationPrevious type="button">Previous</PaginationPrevious></li>
          <PaginationItem value={1}><PaginationPageTrigger type="button" value={1}>1</PaginationPageTrigger></PaginationItem>
          <PaginationItem value={2}><PaginationPageTrigger type="button" value={2}>2</PaginationPageTrigger></PaginationItem>
          <PaginationItem value={3}><PaginationPageTrigger type="button" value={3}>3</PaginationPageTrigger></PaginationItem>
          <PaginationEllipsis value="start">…</PaginationEllipsis>
          <PaginationItem value={10}><PaginationPageTrigger type="button" value={10}>10</PaginationPageTrigger></PaginationItem>
          <li><PaginationNext type="button">Next</PaginationNext></li>
        </PaginationList>
      </PaginationRoot>
    {:else if slug === "card"}
      {@const CardRoot = componentMap.CardRoot}
      {@const CardHeader = componentMap.CardHeader}
      {@const CardTitle = componentMap.CardTitle}
      {@const CardDescription = componentMap.CardDescription}
      {@const CardAction = componentMap.CardAction}
      {@const CardContent = componentMap.CardContent}
      {@const CardFooter = componentMap.CardFooter}
      <CardRoot {...rootProps}>
        <CardHeader>
          <CardTitle><span class="catalog-card-icon" aria-hidden="true"><span></span></span><span>Release health</span></CardTitle>
          <CardDescription>Production deployment status for Acme Cloud.</CardDescription>
          <CardAction><Button variant="ghost" size="sm"><ButtonLabel>View releases</ButtonLabel><ButtonIcon aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></ButtonIcon></Button></CardAction>
        </CardHeader>
        <CardContent>
          <div class="catalog-card-status"><i></i><div><strong>All systems operational</strong><span>12 checks passed across 3 regions</span></div></div>
          <dl class="catalog-card-metrics">
            <div><dt>Version</dt><dd>v2.9.0</dd></div>
            <div><dt>Latency</dt><dd>84 ms</dd></div>
            <div><dt>Errors</dt><dd>0.02%</dd></div>
          </dl>
        </CardContent>
        <CardFooter><div class="catalog-avatar-stack" aria-label="Release owners"><span>AM</span><span>SK</span><span>TR</span></div><span>Deployed 8 minutes ago by Alex Morgan</span></CardFooter>
      </CardRoot>
    {:else if slug === "table"}
      {@const TableRoot = componentMap.TableRoot}
      {@const TableTable = componentMap.TableTable}
      {@const TableCaption = componentMap.TableCaption}
      {@const TableHeader = componentMap.TableHeader}
      {@const TableBody = componentMap.TableBody}
      {@const TableFooter = componentMap.TableFooter}
      {@const TableRow = componentMap.TableRow}
      {@const TableHead = componentMap.TableHead}
      {@const TableCell = componentMap.TableCell}
      <div class="catalog-data-table-demo">
        <div class="catalog-data-table-heading">
          <div><strong>Deployments</strong><span>Monitor release health across environments.</span></div>
          <label class="catalog-table-search">
            <span class="sr-only">Filter deployments</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>
            <input value={tableQuery} oninput={(event) => { tableQuery = event.currentTarget.value; tablePage = 0; }} placeholder="Filter deployments…" />
          </label>
        </div>
        <TableRoot {...rootProps}>
          <TableTable>
            <TableCaption>Deployment environments and their current release health.</TableCaption>
            <TableHeader>
              <TableRow value="header">
                <TableHead value="select"><input type="checkbox" aria-label="Select visible deployments" checked={allVisibleDeploymentsSelected} onchange={(event) => toggleVisibleDeployments(event.currentTarget.checked)} /></TableHead>
                <TableHead value="environment">Environment</TableHead>
                <TableHead value="release">Release</TableHead>
                <TableHead value="status">Status</TableHead>
                <TableHead value="updated">Updated</TableHead>
                <TableHead value="action"><span class="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {#each visibleDeployments as deployment (deployment.id)}
                <TableRow value={deployment.id}>
                  <TableCell value={`${deployment.id}-select`}><input type="checkbox" aria-label={`Select ${deployment.environment}`} checked={selectedDeployments.includes(deployment.id)} onchange={(event) => toggleDeployment(deployment.id, event.currentTarget.checked)} /></TableCell>
                  <TableCell value={`${deployment.id}-environment`}><strong>{deployment.environment}</strong><span class="catalog-table-region">{deployment.region}</span></TableCell>
                  <TableCell value={`${deployment.id}-release`}><code>{deployment.release}</code></TableCell>
                  <TableCell value={`${deployment.id}-status`}><span class="catalog-status-badge" data-status={deployment.status.toLowerCase()}><i></i>{deployment.status}</span></TableCell>
                  <TableCell value={`${deployment.id}-updated`}>{deployment.updated}</TableCell>
                  <TableCell value={`${deployment.id}-action`}><a class="catalog-table-action" href={`#deployment-${deployment.id}`}>Inspect</a></TableCell>
                </TableRow>
              {:else}
                <TableRow value="empty"><TableCell value="empty" colspan="6"><div class="catalog-table-empty"><strong>No deployments found</strong><span>Try another environment, release, status, or region.</span></div></TableCell></TableRow>
              {/each}
            </TableBody>
            <TableFooter>
              <TableRow value="summary">
                <TableCell value="summary" colspan="6">
                  <div class="catalog-table-pagination">
                    <span>{selectedDeployments.length} selected · {filteredDeployments.length} deployments</span>
                    <div>
                      <button type="button" disabled={safeTablePage === 0} onclick={() => tablePage = Math.max(0, tablePage - 1)}>Previous</button>
                      <span>Page {safeTablePage + 1} of {tablePageCount}</span>
                      <button type="button" disabled={safeTablePage >= tablePageCount - 1} onclick={() => tablePage = Math.min(tablePageCount - 1, tablePage + 1)}>Next</button>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            </TableFooter>
          </TableTable>
        </TableRoot>
      </div>
    {:else if slug === "form"}
      {@const FormRoot = componentMap.FormRoot}
      {@const FormErrorSummary = componentMap.FormErrorSummary}
      {@const FormActions = componentMap.FormActions}
      <FormRoot {...rootProps}>
        <div class="catalog-form-field">
          <label for="svelte-workspace-name">Workspace name</label>
          <input
            id="svelte-workspace-name"
            name="workspaceName"
            value="Acme Design"
            autocomplete="organization"
            required
          />
          <span>Used in navigation, invitations, and shared links.</span>
        </div>
        <FormErrorSummary />
        <FormActions>
          <button type="button" class="catalog-secondary-action">Cancel</button>
          <button type="submit" class="catalog-primary-action">Save workspace</button>
        </FormActions>
      </FormRoot>
    {:else if slug === "field"}
      {@const FieldRoot = componentMap.FieldRoot}
      {@const FieldLabel = componentMap.FieldLabel}
      {@const FieldControl = componentMap.FieldControl}
      {@const FieldDescription = componentMap.FieldDescription}
      {@const FieldError = componentMap.FieldError}
      {@const FieldRequiredIndicator = componentMap.FieldRequiredIndicator}
      <FieldRoot {...rootProps} required>
        <FieldLabel for="svelte-work-email">
          Work email <FieldRequiredIndicator>*</FieldRequiredIndicator>
        </FieldLabel>
        <FieldControl>
          <input
            id="svelte-work-email"
            class="catalog-field-input"
            name="email"
            type="email"
            placeholder="you@company.com"
            autocomplete="email"
            aria-describedby="svelte-work-email-description"
            required
          />
        </FieldControl>
        <FieldDescription id="svelte-work-email-description">
          We will only use this for account notifications.
        </FieldDescription>
        <FieldError />
      </FieldRoot>
    {:else if slug === "fieldset"}
      {@const FieldsetRoot = componentMap.FieldsetRoot}
      {@const FieldsetLegend = componentMap.FieldsetLegend}
      {@const FieldsetContent = componentMap.FieldsetContent}
      {@const FieldsetDescription = componentMap.FieldsetDescription}
      {@const FieldsetError = componentMap.FieldsetError}
      <FieldsetRoot {...rootProps}>
        <FieldsetLegend>Workspace notifications</FieldsetLegend>
        <FieldsetDescription>Choose which updates your team should receive.</FieldsetDescription>
        <FieldsetContent>
          <label class="catalog-fieldset-option">
            <input type="checkbox" checked /> Product updates
          </label>
          <label class="catalog-fieldset-option">
            <input type="checkbox" /> Security alerts
          </label>
        </FieldsetContent>
        <FieldsetError />
      </FieldsetRoot>
    {:else if slug === "color-picker"}
      {@const ColorPickerRoot = componentMap.ColorPickerRoot}
      {@const ColorPickerLabel = componentMap.ColorPickerLabel}
      {@const ColorPickerControl = componentMap.ColorPickerControl}
      {@const ColorPickerTrigger = componentMap.ColorPickerTrigger}
      {@const ColorPickerPositioner = componentMap.ColorPickerPositioner}
      {@const ColorPickerContent = componentMap.ColorPickerContent}
      {@const ColorPickerArea = componentMap.ColorPickerArea}
      {@const ColorPickerAreaThumb = componentMap.ColorPickerAreaThumb}
      {@const ColorPickerChannelSlider = componentMap.ColorPickerChannelSlider}
      {@const ColorPickerChannelInput = componentMap.ColorPickerChannelInput}
      {@const ColorPickerSwatch = componentMap.ColorPickerSwatch}
      {@const ColorPickerHiddenInput = componentMap.ColorPickerHiddenInput}
      <ColorPickerRoot {...rootProps}>
        <ColorPickerLabel>Brand color</ColorPickerLabel>
        <ColorPickerControl>
          <ColorPickerTrigger type="button">
            <ColorPickerSwatch aria-hidden="true" />
            <span>Custom color</span>
          </ColorPickerTrigger>
        </ColorPickerControl>
        <ColorPickerPositioner>
          <ColorPickerContent>
            <ColorPickerArea>
              <ColorPickerAreaThumb tabindex={0} />
            </ColorPickerArea>
            <div class="catalog-color-picker-channels">
              {#each colorChannels as channel (channel.value)}
                <label>
                  <span>{channel.label}</span>
                  <ColorPickerChannelSlider value={channel.value} tabindex={0} />
                  <ColorPickerChannelInput value={channel.value} inputmode="decimal" />
                </label>
              {/each}
            </div>
          </ColorPickerContent>
        </ColorPickerPositioner>
        <ColorPickerHiddenInput />
      </ColorPickerRoot>
    {:else if slug === "date-picker"}
      {@const DatePickerRoot = componentMap.DatePickerRoot}
      {@const DatePickerLabel = componentMap.DatePickerLabel}
      {@const DatePickerInput = componentMap.DatePickerInput}
      {@const DatePickerSegment = componentMap.DatePickerSegment}
      {@const DatePickerTrigger = componentMap.DatePickerTrigger}
      {@const DatePickerPositioner = componentMap.DatePickerPositioner}
      {@const DatePickerContent = componentMap.DatePickerContent}
      {@const DatePickerHeader = componentMap.DatePickerHeader}
      {@const DatePickerPrevious = componentMap.DatePickerPrevious}
      {@const DatePickerNext = componentMap.DatePickerNext}
      {@const DatePickerGrid = componentMap.DatePickerGrid}
      {@const DatePickerGridLabel = componentMap.DatePickerGridLabel}
      {@const DatePickerCell = componentMap.DatePickerCell}
      {@const DatePickerCellTrigger = componentMap.DatePickerCellTrigger}
      {@const DatePickerHiddenInput = componentMap.DatePickerHiddenInput}
      <DatePickerRoot {...rootProps}>
        <DatePickerLabel>Due date</DatePickerLabel>
        <div class="catalog-date-picker-control">
          <DatePickerInput>
            <DatePickerSegment value="month">07</DatePickerSegment>
            <span aria-hidden="true">/</span>
            <DatePickerSegment value="day">22</DatePickerSegment>
            <span aria-hidden="true">/</span>
            <DatePickerSegment value="year">2026</DatePickerSegment>
          </DatePickerInput>
          <DatePickerTrigger type="button" aria-label="Open calendar">Calendar</DatePickerTrigger>
        </div>
        <DatePickerPositioner>
          <DatePickerContent>
            <DatePickerHeader>
              <DatePickerPrevious type="button" aria-label="Previous month">‹</DatePickerPrevious>
              <strong>July 2026</strong>
              <DatePickerNext type="button" aria-label="Next month">›</DatePickerNext>
            </DatePickerHeader>
            <DatePickerGrid>
              <DatePickerGridLabel>July 2026</DatePickerGridLabel>
              <thead>
                <tr>
                  {#each ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as day (day)}
                    <th scope="col">{day}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each july2026Rows as row (row[0].key)}
                  <tr>
                    {#each row as date (date.key)}
                      <DatePickerCell value={date.key}>
                        <DatePickerCellTrigger type="button" value={date.key}>{date.day}</DatePickerCellTrigger>
                      </DatePickerCell>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </DatePickerGrid>
          </DatePickerContent>
        </DatePickerPositioner>
        <DatePickerHiddenInput />
      </DatePickerRoot>
    {:else if slug === "dialog"}
      {@const DialogRoot = componentMap.DialogRoot}
      {@const DialogTrigger = componentMap.DialogTrigger}
      {@const DialogPortal = componentMap.DialogPortal}
      {@const DialogBackdrop = componentMap.DialogBackdrop}
      {@const DialogPositioner = componentMap.DialogPositioner}
      {@const DialogContent = componentMap.DialogContent}
      {@const DialogTitle = componentMap.DialogTitle}
      {@const DialogDescription = componentMap.DialogDescription}
      {@const DialogClose = componentMap.DialogClose}
      <DialogRoot {...rootProps}>
        <DialogTrigger type="button">Edit profile</DialogTrigger>
        <DialogPortal>
          <DialogBackdrop />
          <DialogPositioner>
            <DialogContent class={route.fixtureId === "long-content" ? "catalog-dialog-content catalog-dialog-content--long" : "catalog-dialog-content"}>
              <DialogTitle>Edit profile</DialogTitle>
              <DialogDescription>Update the details teammates see across your workspace.</DialogDescription>
              {#if route.fixtureId === "long-content"}
                <div class="catalog-dialog-long-copy">
                  <section><h3>Profile visibility</h3><p>Your name and photo are visible to every member of this workspace and in shared activity.</p></section>
                  <section><h3>Contact details</h3><p>Your work email is only shown to workspace owners and administrators who manage access.</p></section>
                  <section><h3>Notifications</h3><p>Security and billing notices continue to use the verified account email even when this profile changes.</p></section>
                </div>
              {/if}
              <form class="catalog-dialog-form" onsubmit={(event) => event.preventDefault()}>
                <label>Display name<input name="displayName" value="Alex Morgan" autocomplete="name" /></label>
                <label>Work email<input name="email" type="email" value="alex@company.com" autocomplete="email" /></label>
                <div class="catalog-dialog-actions">
                  <button type="button" class="catalog-dialog-cancel">Cancel</button>
                  <button type="submit" class="catalog-primary-action">Save changes</button>
                </div>
              </form>
              {#if route.fixtureId === "nested-overlay"}
                <DialogRoot defaultOpen environment={{ scopeId: "uifn-catalog-dialog-nested", hydrationSeed: "dialog-nested" }}>
                  <DialogTrigger type="button">Review sharing</DialogTrigger>
                  <DialogPortal>
                    <DialogBackdrop />
                    <DialogPositioner>
                      <DialogContent class="catalog-dialog-content catalog-dialog-content--nested">
                        <DialogTitle>Share profile changes?</DialogTitle>
                        <DialogDescription>These updates will be visible to everyone in Acme Cloud.</DialogDescription>
                        <div class="catalog-dialog-actions">
                          <DialogClose type="button" class="catalog-dialog-cancel catalog-dialog-inline-close">Keep editing</DialogClose>
                          <button type="button" class="catalog-primary-action">Share changes</button>
                        </div>
                      </DialogContent>
                    </DialogPositioner>
                  </DialogPortal>
                </DialogRoot>
              {/if}
              <DialogClose type="button" aria-label="Close dialog" class="catalog-overlay-close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg></DialogClose>
            </DialogContent>
          </DialogPositioner>
        </DialogPortal>
      </DialogRoot>
    {:else if slug === "drawer"}
      {@const DrawerRoot = componentMap.DrawerRoot}
      {@const DrawerTrigger = componentMap.DrawerTrigger}
      {@const DrawerPortal = componentMap.DrawerPortal}
      {@const DrawerBackdrop = componentMap.DrawerBackdrop}
      {@const DrawerPositioner = componentMap.DrawerPositioner}
      {@const DrawerContent = componentMap.DrawerContent}
      {@const DrawerHandle = componentMap.DrawerHandle}
      {@const DrawerTitle = componentMap.DrawerTitle}
      {@const DrawerDescription = componentMap.DrawerDescription}
      {@const DrawerClose = componentMap.DrawerClose}
      <DrawerRoot {...rootProps}>
        <DrawerTrigger type="button">Open filters</DrawerTrigger>
        <DrawerPortal>
          <DrawerBackdrop />
          <DrawerPositioner>
            <DrawerContent>
              <DrawerHandle aria-hidden="true" />
              <DrawerTitle>Filter activity</DrawerTitle>
              <DrawerDescription>Narrow the workspace feed without leaving the page.</DrawerDescription>
              <form class="catalog-drawer-form" onsubmit={(event) => event.preventDefault()}>
                <fieldset>
                  <legend>Activity type</legend>
                  <label><input type="checkbox" checked /> Deployments</label>
                  <label><input type="checkbox" checked /> Pull requests</label>
                  <label><input type="checkbox" /> Team updates</label>
                </fieldset>
                <label>Member<select value="any"><option value="any">Anyone</option><option>Alex Morgan</option><option>Sam Rivera</option></select></label>
                <button type="submit" class="catalog-primary-action">Apply filters</button>
              </form>
              <DrawerClose type="button" aria-label="Close filters" class="catalog-overlay-close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg></DrawerClose>
            </DrawerContent>
          </DrawerPositioner>
        </DrawerPortal>
      </DrawerRoot>
    {:else if slug === "hover-card"}
      {@const HoverCardRoot = componentMap.HoverCardRoot}
      {@const HoverCardTrigger = componentMap.HoverCardTrigger}
      {@const HoverCardPositioner = componentMap.HoverCardPositioner}
      {@const HoverCardContent = componentMap.HoverCardContent}
      {@const HoverCardArrow = componentMap.HoverCardArrow}
      <HoverCardRoot {...rootProps}>
        <HoverCardTrigger href="#preview">@alex</HoverCardTrigger>
        <HoverCardPositioner>
          <HoverCardContent>
            <HoverCardArrow />
            <div class="catalog-profile-card">
              <span class="catalog-profile-avatar" aria-hidden="true">AM</span>
              <div><strong>Alex Morgan</strong><span>Frontend infrastructure</span></div>
              <p>Building accessible platform primitives for the design systems team.</p>
              <dl><div><dt>Projects</dt><dd>42</dd></div><div><dt>Following</dt><dd>128</dd></div></dl>
            </div>
          </HoverCardContent>
        </HoverCardPositioner>
      </HoverCardRoot>
    {:else if slug === "splitter"}
      {@const SplitterRoot = componentMap.SplitterRoot}
      {@const SplitterPanel = componentMap.SplitterPanel}
      {@const SplitterResizeTrigger = componentMap.SplitterResizeTrigger}
      {@const SplitterResizeHandle = componentMap.SplitterResizeHandle}
      <SplitterRoot {...rootProps} aria-label="Workspace layout">
        <SplitterPanel value={0}>Navigation</SplitterPanel>
        <SplitterResizeTrigger value={0} />
        <SplitterResizeHandle value={0} />
        <SplitterPanel value={1}>Editor</SplitterPanel>
      </SplitterRoot>
    {:else if slug === "steps"}
      {@const StepsRoot = componentMap.StepsRoot}
      {@const StepsList = componentMap.StepsList}
      {@const StepsItem = componentMap.StepsItem}
      {@const StepsTrigger = componentMap.StepsTrigger}
      {@const StepsIndicator = componentMap.StepsIndicator}
      {@const StepsSeparator = componentMap.StepsSeparator}
      {@const StepsContent = componentMap.StepsContent}
      {@const StepsCompleted = componentMap.StepsCompleted}
      {@const stepLabels = ["Account", "Profile", "Review"]}
      {@const stepDescriptions = ["Create your account.", "Complete your profile.", "Review and submit."]}
      <StepsRoot {...rootProps} aria-label="Account setup">
        <StepsList>
          {#each stepLabels as label, index (label)}
            <StepsItem value={index}>
              <StepsIndicator value={index}>{index + 1}</StepsIndicator>
              <StepsCompleted value={index}>✓</StepsCompleted>
              <StepsTrigger type="button" value={index}>{label}</StepsTrigger>
              <StepsSeparator value={index} />
            </StepsItem>
          {/each}
        </StepsList>
        {#each stepDescriptions as description, index (description)}
          <StepsContent value={index}>{description}</StepsContent>
        {/each}
      </StepsRoot>
    {:else if slug === "navigation-menu"}
      {@const NavigationRoot = componentMap.NavigationMenuRoot}
      {@const NavigationList = componentMap.NavigationMenuList}
      {@const NavigationItem = componentMap.NavigationMenuItem}
      {@const NavigationTrigger = componentMap.NavigationMenuTrigger}
      {@const NavigationContent = componentMap.NavigationMenuContent}
      {@const NavigationLink = componentMap.NavigationMenuLink}
      {@const NavigationViewport = componentMap.NavigationMenuViewport}
      {@const NavigationIndicator = componentMap.NavigationMenuIndicator}
      <NavigationRoot {...rootProps}>
        <NavigationList>
          <NavigationItem value="item-1">
            <NavigationTrigger type="button" value="item-1">Products</NavigationTrigger>
            <NavigationContent value="item-1">
              <NavigationLink class="catalog-navigation-card" value="item-1" href="#products">
                <strong>Product overview</strong>
                <span>Explore primitives, recipes, and production-ready components.</span>
              </NavigationLink>
            </NavigationContent>
          </NavigationItem>
          <NavigationItem value="item-2">
            <NavigationTrigger type="button" value="item-2">Resources</NavigationTrigger>
            <NavigationContent value="item-2">
              <NavigationLink class="catalog-navigation-card" value="item-2" href="#documentation">
                <strong>Documentation</strong>
                <span>Learn the APIs, accessibility model, and framework adapters.</span>
              </NavigationLink>
            </NavigationContent>
          </NavigationItem>
          <NavigationItem value="item-3">
            <NavigationTrigger type="button" value="item-3">Company</NavigationTrigger>
            <NavigationContent value="item-3">
              <NavigationLink class="catalog-navigation-card" value="item-3" href="#company">
                <strong>About uifn</strong>
                <span>Meet the team building the cross-framework UI foundation.</span>
              </NavigationLink>
            </NavigationContent>
          </NavigationItem>
        </NavigationList>
        <NavigationViewport />
        <NavigationIndicator />
      </NavigationRoot>
    {:else if slug === "tree-view"}
      {@const TreeRoot = componentMap.TreeViewRoot}
      {@const TreeLabel = componentMap.TreeViewLabel}
      {@const Tree = componentMap.TreeViewTree}
      {@const TreeItem = componentMap.TreeViewItem}
      {@const TreeItemTrigger = componentMap.TreeViewItemTrigger}
      {@const TreeItemText = componentMap.TreeViewItemText}
      {@const TreeBranch = componentMap.TreeViewBranch}
      {@const TreeIndicator = componentMap.TreeViewIndicator}
      <TreeRoot {...rootProps}>
        <TreeLabel>Project files</TreeLabel>
        <Tree>
          <TreeItem value="item-1">
            <TreeItemTrigger type="button" value="item-1" aria-label="Toggle Workspace">›</TreeItemTrigger>
            <TreeItemText value="item-1">Workspace</TreeItemText>
            <TreeBranch value="item-1">
              <TreeItem value="item-2">
                <TreeItemTrigger type="button" value="item-2" aria-label="Projects">›</TreeItemTrigger>
                <TreeItemText value="item-2">Projects</TreeItemText>
                <TreeBranch value="item-2" />
                <TreeIndicator value="item-2">⌄</TreeIndicator>
              </TreeItem>
            </TreeBranch>
            <TreeIndicator value="item-1">⌄</TreeIndicator>
          </TreeItem>
        </Tree>
      </TreeRoot>
    {:else if slug === "tags-input"}
      {@const TagsRoot = componentMap.TagsInputRoot}
      {@const TagsLabel = componentMap.TagsInputLabel}
      {@const TagsControl = componentMap.TagsInputControl}
      {@const TagsItem = componentMap.TagsInputItem}
      {@const TagsItemText = componentMap.TagsInputItemText}
      {@const TagsItemDelete = componentMap.TagsInputItemDelete}
      {@const TagsInput = componentMap.TagsInputInput}
      {@const TagsClear = componentMap.TagsInputClear}
      {@const TagsHiddenInput = componentMap.TagsInputHiddenInput}
      {@const TagsError = componentMap.TagsInputError}
      <TagsRoot
        {...rootProps}
        value={tagsValue}
        onValueChange={(next: unknown) => {
          tagsValue = Array.isArray(next) ? next.map(String) : [];
        }}
      >
        <TagsLabel>Release tags</TagsLabel>
        <TagsControl>
          {#each tagsValue as value (value)}
            <TagsItem {value}>
              <TagsItemText {value}>{value === "item-1" ? "Frontend" : value === "item-2" ? "Stable" : value}</TagsItemText>
              <TagsItemDelete {value} aria-label={`Remove ${value}`}><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg></TagsItemDelete>
            </TagsItem>
          {/each}
          <TagsInput aria-label="Add tag" placeholder="Add a tag" />
        </TagsControl>
        <TagsClear>Clear all tags</TagsClear>
        {#each tagsValue as value (value)}
          <TagsHiddenInput {value} />
        {/each}
        <TagsError />
      </TagsRoot>
    {:else if demo.root.voidElement}
      <Root {...rootProps} />
    {:else}
      <Root {...rootProps}>
        {@const rootChildren = catalogDemoChildren(demo, demo.root.id)}
        {#if rootChildren.length}
          {#each rootChildren as part (part.id)}
            {#each catalogDemoPartInstances(part) as instanceIndex (`${part.id}-${instanceIndex}`)}
              {@render renderPart(part, instanceIndex, componentMap)}
            {/each}
          {/each}
        {:else}
          {catalogDemoRootText(slug) ?? ""}
        {/if}
      </Root>
    {/if}
  {:else}
    <article data-uifn-unsupported="true">Missing Svelte export {demo.root.exportName}</article>
  {/if}
{/await}
