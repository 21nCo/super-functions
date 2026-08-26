<script lang="ts">
  import {
    Button,
    ButtonIcon,
    ButtonLabel,
    ButtonSpinner,
  } from "@uifn/components-svelte/button";
  import { createCopyToClipboard } from "@uifn/svelte/hooks/copy-to-clipboard";
  import { createMediaQuery } from "@uifn/svelte/hooks/media-query";
  import { untrack } from "svelte";
  import * as patterns from "@uifn/patterns";
  import * as sf from "@uifn/sf";
  import {
    allQaContracts,
    activateCatalogUi,
    activateWorkbenchRoute,
    catalogComponentDetailsHtml,
    catalogDemoCodeHtml,
    catalogDemoFixtureDescription,
    catalogDemoFixtureIds,
    catalogDemoFixtureLabel,
    catalogComponentGalleryHtml,
    catalogDemoRootPropsForRoute,
    catalogFrameworkLabel,
    catalogGuideHtml,
    catalogHooks,
    catalogPageDescription,
    catalogPageKind,
    catalogPageTitle,
    catalogSidebarHtml,
    catalogTopbarHtml,
    catalogThemeStyle,
    getCatalogHookBySlug,
    getComponentBySlug,
    getPatternBySlug,
    getSfPanelBySlug,
    getStatusFromRoute,
    patternModelHtml,
    patternProps,
    parseWorkbenchPath,
    getScenarioBySlug,
    scenarioModelHtml,
    stripCatalogBasePath,
    updateCatalogDocumentMetadata,
    withCatalogBasePath,
    workbenchComponents,
    workbenchFrameworks,
    workbenchPatterns,
    workbenchRoutes,
    workbenchScenarios,
    workbenchSfPanels,
    type ComponentSlug,
    type WorkbenchRoute,
  } from "@uifn/examples-shared";
  import type { PatternName, PatternRenderModel } from "@uifn/patterns";
  import CatalogComponentFixture from "./CatalogComponentFixture.svelte";
  import { svelteComponentLoaders } from "./component-loaders";

  type PatternMap = Record<string, (props: Record<string, unknown>) => PatternRenderModel>;
  type SfMap = Record<string, (props: Record<string, unknown>) => Promise<PatternRenderModel & Record<string, unknown>>>;

  const patternMap = patterns as PatternMap;
  const sfMap = sf as SfMap;
  const mediaQuery = createMediaQuery("(min-width: 768px)", { defaultValue: false });
  const clipboard = createCopyToClipboard();
  const { status: copyStatus, copiedText, copy } = clipboard;

  let { basePath = "" }: { basePath?: string } = $props();
  function initialPath() {
    return stripCatalogBasePath(window.location.pathname, basePath);
  }
  const sidebarHtml = untrack(
    () => catalogSidebarHtml(basePath, "svelte", initialPath()),
  );
  let path = $state(initialPath());
  let buttonToastOpen = $state(false);
  let shellElement: HTMLElement;
  const route = $derived(parseWorkbenchPath(path));
  const theme = $derived(new URLSearchParams(window.location.search).get("theme") || "light");
  const currentHook = $derived(path.startsWith("/hooks/") ? getCatalogHookBySlug(path.slice("/hooks/".length)) : undefined);
  const pageTitle = $derived(catalogPageTitle(path, path === "/hooks" ? "Hooks" : currentHook?.displayName ?? route.title));
  const pageDescription = $derived(catalogPageDescription(path, route, "svelte"));
  const pageKind = $derived(catalogPageKind(path, route));

  function navigate(next: string) {
    window.history.pushState(null, "", withCatalogBasePath(basePath, next));
    path = next;
  }

  window.addEventListener("popstate", () => {
    path = stripCatalogBasePath(window.location.pathname, basePath);
  });

  $effect(() => {
    route.path;
    pageTitle;
    pageDescription;
    updateCatalogDocumentMetadata(pageTitle, pageDescription, "svelte", path);
    if (!shellElement) return undefined;
    activateCatalogUi(shellElement, {
      basePath,
      currentPath: path,
      navigate,
    });
    if (path.startsWith("/hooks")) return undefined;
    return activateWorkbenchRoute(shellElement, route, { framework: "svelte" });
  });

  function galleryRoutes(current: WorkbenchRoute) {
    if (current.path === "/" || current.path === "/components") return workbenchComponents.map((component) => `/components/${component.slug}`);
    if (current.path === "/scenarios") return workbenchScenarios.map((scenario) => `/scenarios/${scenario.slug}`);
    if (current.path === "/patterns") return workbenchPatterns.map((pattern) => `/patterns/${pattern.slug}`);
    if (current.path === "/sf") return workbenchSfPanels.map((panel) => `/sf/${panel.slug}`);
    return workbenchRoutes.filter((candidate) => candidate.contract).slice(0, 160).map((candidate) => candidate.path);
  }

  function componentFixtureRoutes(current: WorkbenchRoute) {
    const component = current.slug ? getComponentBySlug(current.slug) : undefined;
    if (!component && current.slug !== "combobox") return [];
    if (current.path.endsWith("/states")) {
      const states = catalogDemoFixtureIds((component?.slug ?? "combobox") as ComponentSlug, component ? component.states.slice(0, 8) : ["default", "open", "disabled", "invalid"]);
      return states.map((state) => ({ ...current, fixtureId: state }));
    }
    if (current.path.endsWith("/qa") && current.contract) {
      return current.contract.fixtures.map((fixture) => ({ ...current, path: fixture.route, fixtureId: fixture.id }));
    }
    return [current];
  }

  function renderPattern(slug: string, current: WorkbenchRoute) {
    const pattern = getPatternBySlug(slug);
    if (!pattern) return "<article data-uifn-unsupported='true'>Unknown pattern</article>";
    const render = patternMap[pattern.name];
    if (!render) return `<article data-uifn-unsupported="true">Missing pattern export ${pattern.name}</article>`;
    const status = getStatusFromRoute(current);
    const model = render(patternProps(pattern.name as PatternName, status));
    return patternModelHtml({
      family: "pattern",
      slug,
      name: pattern.name,
      status,
      itemCount: model.state.itemCount,
      callbacks: model.callbacks,
      data: model.data,
      backendImports: model.backendImports,
    });
  }

  function renderScenario(slug: string) {
    const scenario = getScenarioBySlug(slug);
    if (!scenario) return `<article data-uifn-unsupported="true">Unknown scenario ${slug}</article>`;
    return scenarioModelHtml(scenario);
  }

  async function renderSf(slug: string, current: WorkbenchRoute) {
    const panel = getSfPanelBySlug(slug);
    if (!panel) return "<article data-uifn-unsupported='true'>Unknown SF panel</article>";
    const render = sfMap[panel.name];
    if (!render) return `<article data-uifn-unsupported="true">Missing SF export ${panel.name}</article>`;
    const status = getStatusFromRoute(current);
    const sfClients = sf.createMockSuperfunctionClients();
    const model = await render({
      status,
      authClient: sfClients.authClient,
      plugClient: sfClients.plugClient,
      fileClient: sfClients.fileClient,
      billClient: sfClients.billClient,
    });
    return patternModelHtml({
      family: "sf",
      slug,
      name: panel.name,
      status,
      itemCount: model.state.itemCount,
      callbacks: model.callbacks,
      data: model.data,
      backendImports: model.backendImports,
      metadata: {
        superfunction: model.superfunction,
        controlledCounterpart: model.controlledCounterpart,
        usesInjectedClient: String(model.usesInjectedClient),
        clientType: "fake",
        clientCallCount: Object.values(sfClients.getCallSummary()).reduce((sum, value) => sum + Number(value), 0),
      },
    });
  }
</script>

<div bind:this={shellElement} class="workbench-shell" style={catalogThemeStyle(theme)} data-uifn-workbench="svelte" data-uifn-loaded="true" data-uifn-theme={theme}>
  <div class="catalog-sidebar-host">{@html sidebarHtml}</div>

  <main class="workbench-main" aria-labelledby="route-title" data-catalog-page={pageKind}>
    <div class="catalog-topbar-host">{@html catalogTopbarHtml(basePath, "svelte", path)}</div>
    <header class="catalog-page-header">
      <p class="eyebrow">{catalogFrameworkLabel("svelte")} · uifn</p>
      <h1 id="route-title">{pageTitle}</h1>
      <p>{pageDescription}</p>
    </header>

    {#if route.family === "guide"}
      {@html catalogGuideHtml(path, "svelte", basePath)}
    {:else if path === "/hooks"}
      <div class="route-grid">
        {#each catalogHooks as hook}
          <a class="route-card" href={withCatalogBasePath(basePath, `/hooks/${hook.slug}`)} onclick={(event) => { event.preventDefault(); navigate(`/hooks/${hook.slug}`); }}>
            <strong>{hook.displayName}</strong><br />
            <span>{hook.description}</span>
          </a>
        {/each}
      </div>
    {:else if currentHook?.slug === "use-media-query"}
      <article class="fixture-card" data-uifn-hook={currentHook.slug}>
        <p class="eyebrow">Live browser result</p>
        <h2>{currentHook.displayName}</h2>
        <p>{currentHook.description}</p>
        <output aria-live="polite">Viewport is {$mediaQuery ? "at least" : "below"} 768px.</output>
      </article>
    {:else if currentHook?.slug === "use-copy-to-clipboard"}
      <article class="fixture-card" data-uifn-hook={currentHook.slug}>
        <p class="eyebrow">Interactive hook</p>
        <h2>{currentHook.displayName}</h2>
        <p>{currentHook.description}</p>
        <button type="button" onclick={() => void copy("Copied from the Svelte uifn catalog")}>Copy catalog text</button>
        <p aria-live="polite">Status: {$copyStatus}; copied: {$copiedText ?? "nothing yet"}</p>
      </article>
    {:else if route.family === "component" && route.slug}
      {@const component = getComponentBySlug(route.slug)}
      {#if component || route.slug === "combobox"}
        <div class="catalog-demo-tabs" data-catalog-demo-tabs>
          <div class="catalog-preview-toolbar">
            <div class="catalog-preview-tabs" role="tablist" aria-label={`${route.title} example`}>
              <button type="button" role="tab" aria-selected="true" aria-controls={`preview-${route.slug}`} data-catalog-demo-tab="preview"><i></i> Preview</button>
              <button type="button" role="tab" aria-selected="false" aria-controls={`preview-code-${route.slug}`} data-catalog-demo-tab="code">Code</button>
            </div>
            <a href={withCatalogBasePath(basePath, `/components/${route.slug}/states`)}>States</a>
            <a href={withCatalogBasePath(basePath, `/components/${route.slug}/qa`)}>QA cases</a>
          </div>
          <div id={`preview-${route.slug}`} role="tabpanel" data-catalog-demo-panel="preview">
            <h2 class="sr-only">{route.title} preview</h2>
            <div
              class="fixture-grid"
              data-catalog-state-grid={route.path.endsWith("/states") ? "true" : undefined}
            >
              {#each componentFixtureRoutes(route) as fixtureRoute}
                <section class="fixture-card">
                  <p class="eyebrow">{catalogDemoFixtureLabel(fixtureRoute.fixtureId)}</p>
                  <div
                    class="qa-edge-box"
                    data-case={fixtureRoute.fixtureId ?? "default"}
                    data-catalog-preview-size={["card", "table", "command"].includes(route.slug) ? "large" : undefined}
                  >
                    {#if route.slug === "button"}
                    <div class="catalog-button-demo">
                      <Button
                        {...catalogDemoRootPropsForRoute(route.slug, fixtureRoute)}
                        onclick={() => buttonToastOpen = true}
                      >
                        <ButtonIcon aria-hidden="true">
                          <svg viewBox="0 0 24 24" focusable="false"><path d="m5 12 4 4L19 6" /></svg>
                        </ButtonIcon>
                        {#if !fixtureRoute.fixtureId?.startsWith("icon-")}
                          <ButtonLabel>Save changes</ButtonLabel>
                        {/if}
                        <ButtonSpinner aria-hidden="true">Saving</ButtonSpinner>
                      </Button>
                      <span>{catalogDemoFixtureDescription("button", fixtureRoute.fixtureId)}</span>
                    </div>
                    {:else}
                      <CatalogComponentFixture
                        slug={route.slug as ComponentSlug}
                        route={fixtureRoute}
                      />
                    {/if}
                  </div>
                  {#if route.slug === "button" && buttonToastOpen}
                    {#await svelteComponentLoaders.toast?.()}
                      <span class="catalog-action-loading" aria-hidden="true"></span>
                    {:then toastModule}
                      {@const ToastViewport = toastModule?.ToastViewport ?? toastModule?.Toast}
                      {@const ToastRoot = toastModule?.ToastRoot}
                      {@const ToastTitle = toastModule?.ToastTitle}
                      {@const ToastDescription = toastModule?.ToastDescription}
                      {@const ToastAction = toastModule?.ToastAction}
                      {@const ToastClose = toastModule?.ToastClose}
                      {#if ToastViewport && ToastRoot && ToastTitle && ToastDescription && ToastAction && ToastClose}
                        <ToastViewport
                          class="catalog-action-toast"
                          toasts={[{
                            id: "save-confirmation",
                            title: "Changes published",
                            description: "Your changes are now live.",
                            duration: null,
                          }]}
                          duration={null}
                          messages={{ dismissed: "Dismiss notification" }}
                          onDismiss={() => buttonToastOpen = false}
                        >
                          <ToastRoot value="save-confirmation">
                            <ToastTitle value="save-confirmation">Changes published</ToastTitle>
                            <ToastDescription value="save-confirmation">Your changes are now live.</ToastDescription>
                            <ToastAction value="save-confirmation">Undo</ToastAction>
                            <ToastClose value="save-confirmation">Close</ToastClose>
                          </ToastRoot>
                        </ToastViewport>
                      {/if}
                    {/await}
                  {/if}
                </section>
              {/each}
            </div>
          </div>
          <div id={`preview-code-${route.slug}`} class="catalog-demo-code" role="tabpanel" data-catalog-demo-panel="code" hidden>
            {@html catalogDemoCodeHtml(route.slug, "svelte")}
          </div>
        </div>
        {#if route.path === `/components/${route.slug}`}
          {@html catalogComponentDetailsHtml(route.slug, "svelte", basePath)}
        {/if}
      {:else}
        <article data-uifn-unsupported="true">Unknown component route</article>
      {/if}
    {:else if route.family === "pattern" && route.slug}
      {@html renderPattern(route.slug, route)}
    {:else if route.family === "sf" && route.slug}
      {#await renderSf(route.slug, route)}
        <article data-uifn-sf={route.slug} data-status="loading">Loading {route.slug}</article>
      {:then html}
        {@html html}
      {/await}
    {:else if route.family === "scenario" && route.slug}
      {@html renderScenario(route.slug)}
    {:else}
      {#if route.path === "/" || route.path === "/components"}
        {@html catalogComponentGalleryHtml(basePath, "svelte")}
      {:else}
        <div class="route-grid">
          {#each galleryRoutes(route) as cardPath}
            {@const cardRoute = parseWorkbenchPath(cardPath)}
            <a class="route-card" href={withCatalogBasePath(basePath, cardPath)} onclick={(event) => { event.preventDefault(); navigate(cardPath); }}>
              <strong>{cardRoute.title}</strong><br />
              <code>{cardPath}</code>
            </a>
          {/each}
        </div>
      {/if}
    {/if}
    <footer class="catalog-site-footer"><span>uifn · actual components, three native frameworks</span><a href="/components/">All frameworks</a></footer>
  </main>
</div>
