import { createEffect, createMemo, createResource, createSignal, For, onCleanup, Show, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { render } from "solid-js/web";
import { Button } from "@uifn/components-solid/button";
import { useCopyToClipboard } from "@uifn/solid/hooks/copy-to-clipboard";
import { useMediaQuery } from "@uifn/solid/hooks/media-query";
import * as patterns from "@uifn/patterns";
import * as sf from "@uifn/sf";
import {
  allQaContracts,
  activateCatalogUi,
  activateWorkbenchRoute,
  catalogDemoChildren,
  catalogDemoFixtureDescription,
  catalogDemoFixtureIds,
  catalogDemoFixtureLabel,
  catalogDemoPartInstances,
  catalogDemoPartProps,
  catalogDemoPartText,
  catalogDemoRootText,
  catalogDemoShouldAddFallbackText,
  catalogDemoRootPropsForRoute,
  catalogDeploymentRows,
  catalogComponentDetailsHtml,
  catalogDemoCodeHtml,
  catalogComponentGalleryHtml,
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
  getCatalogComponentDemo,
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
  workbenchCounts,
  workbenchFrameworks,
  workbenchPatterns,
  workbenchRoutes,
  workbenchScenarios,
  workbenchSfPanels,
  type ComponentSlug,
  type CatalogComponentDemo,
  type CatalogDemoPart,
  type WorkbenchRoute,
} from "@uifn/examples-shared";
import type { PatternName, PatternRenderModel } from "@uifn/patterns";
import { solidComponentLoaders } from "./component-loaders";
import "@uifn/components/styles.css";
import "./styles.css";

type PatternMap = Record<string, (props: Record<string, unknown>) => PatternRenderModel>;
type SfMap = Record<string, (props: Record<string, unknown>) => Promise<PatternRenderModel & Record<string, unknown>>>;

const patternMap = patterns as PatternMap;
const sfMap = sf as SfMap;

function createRouteSignal(basePath: string) {
  const [path, setPath] = createSignal(stripCatalogBasePath(window.location.pathname, basePath));
  const onPopState = () => setPath(stripCatalogBasePath(window.location.pathname, basePath));
  window.addEventListener("popstate", onPopState);
  onCleanup(() => window.removeEventListener("popstate", onPopState));
  return [
    path,
    () => parseWorkbenchPath(path()),
    (next: string) => {
      window.history.pushState(null, "", withCatalogBasePath(basePath, next));
      setPath(next);
    },
  ] as const;
}

function Nav(props: { basePath: string }) {
  const html = catalogSidebarHtml(
    props.basePath,
    "solid",
    stripCatalogBasePath(window.location.pathname, props.basePath),
  );
  return <div class="catalog-sidebar-host" innerHTML={html} />;
}

function HookFixture(props: { slug: string }) {
  const hook = () => getCatalogHookBySlug(props.slug);
  const matches = useMediaQuery("(min-width: 768px)", { defaultValue: false });
  const clipboard = useCopyToClipboard();

  return (
    <Show when={hook()} fallback={<Unsupported family="hook" slug={props.slug} reason="Unknown hook" />}>
      {(current) => (
        <article class="fixture-card" data-uifn-hook={current().slug}>
          <p class="eyebrow">{current().slug === "use-media-query" ? "Live browser result" : "Interactive hook"}</p>
          <h2>{current().displayName}</h2>
          <p>{current().description}</p>
          <Show
            when={current().slug === "use-media-query"}
            fallback={
              <>
                <button type="button" onClick={() => void clipboard.copy("Copied from the Solid uifn catalog")}>
                  Copy catalog text
                </button>
                <p aria-live="polite">Status: {clipboard.status()}; copied: {clipboard.copiedText() ?? "nothing yet"}</p>
              </>
            }
          >
            <output aria-live="polite">Viewport is {matches() ? "at least" : "below"} 768px.</output>
          </Show>
        </article>
      )}
    </Show>
  );
}

function Unsupported(props: { family: string; slug: string; reason: string }) {
  return (
    <article class="fixture-card" data-uifn-unsupported="true" data-family={props.family} data-slug={props.slug}>
      <h2>{props.slug}</h2>
      <p>{props.reason}</p>
    </article>
  );
}

function ComponentFixture(props: { slug: ComponentSlug | "combobox"; route: WorkbenchRoute }) {
  const fixtureCase = props.route.fixtureId ?? "default";
  const [toastOpen, setToastOpen] = createSignal(false);
  const [toastModule] = createResource(
    () => props.slug === "button",
    async (enabled) => enabled ? solidComponentLoaders.toast?.() : undefined,
  );
  if (props.slug === "button") {
    return (
      <>
        <div class="qa-edge-box" data-case={fixtureCase}>
          <div class="catalog-button-demo">
            <Button
              {...catalogDemoRootPropsForRoute(props.slug, props.route)}
              onClick={() => setToastOpen(true)}
            >
              <Button.Icon aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false"><path d="m5 12 4 4L19 6" /></svg>
              </Button.Icon>
              <Show when={!fixtureCase.startsWith("icon-")}><Button.Label>Save changes</Button.Label></Show>
              <Button.Spinner aria-hidden="true">Saving</Button.Spinner>
            </Button>
            <span>{catalogDemoFixtureDescription("button", fixtureCase)}</span>
          </div>
        </div>
        <Show when={toastOpen() && toastModule()}>
          {(loaded) => {
            const componentMap = loaded() as Record<string, unknown>;
            const ToastViewport = componentMap.ToastViewport ?? componentMap.Toast;
            return (
              <Dynamic
                component={ToastViewport as never}
                class="catalog-action-toast"
                toasts={[{
                  id: "save-confirmation",
                  title: "Changes published",
                  description: "Your changes are now live.",
                  duration: null,
                }]}
                duration={null}
                messages={{ dismissed: "Dismiss notification" }}
                onDismiss={() => setToastOpen(false)}
              >
                <Dynamic component={componentMap.ToastRoot as never} value="save-confirmation">
                  <Dynamic component={componentMap.ToastTitle as never} value="save-confirmation">Changes published</Dynamic>
                  <Dynamic component={componentMap.ToastDescription as never} value="save-confirmation">Your changes are now live.</Dynamic>
                  <Dynamic component={componentMap.ToastAction as never} value="save-confirmation">Undo</Dynamic>
                  <Dynamic component={componentMap.ToastClose as never} value="save-confirmation">Close</Dynamic>
                </Dynamic>
              </Dynamic>
            );
          }}
        </Show>
      </>
    );
  }
  return (
    <div
      class="qa-edge-box"
      data-case={fixtureCase}
      data-catalog-preview-size={["card", "table", "command"].includes(props.slug) ? "large" : undefined}
    >
      <Show when={props.slug === "tour"}>
        <button id="uifn-tour-target" type="button">Tour target</button>
      </Show>
      <CanonicalComponentFixture slug={props.slug} route={props.route} />
    </div>
  );
}

function CanonicalComponentFixture(props: { slug: ComponentSlug; route: WorkbenchRoute }) {
  const [loaded] = createResource(
    () => props.slug,
    (slug) => solidComponentLoaders[slug]?.(),
  );
  return (
    <Show
      when={loaded()}
      fallback={<article data-uifn-component-loading={props.slug}>Loading {props.slug}…</article>}
    >
      {(componentModule) => (
        <LoadedCanonicalComponentFixture
          slug={props.slug}
          route={props.route}
          componentMap={componentModule() as Record<string, unknown>}
        />
      )}
    </Show>
  );
}

function LoadedCanonicalComponentFixture(props: {
  slug: ComponentSlug;
  route: WorkbenchRoute;
  componentMap: Record<string, unknown>;
}) {
  const demo = getCatalogComponentDemo(props.slug);
  if (props.slug === "form") {
    return <SolidFormFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "field") {
    return <SolidFieldFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "breadcrumb") {
    return <SolidBreadcrumbFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "card") {
    return <SolidCardFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "skeleton") {
    return <SolidSkeletonFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "fieldset") {
    return <SolidFieldsetFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "color-picker") {
    return <SolidColorPickerFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "date-picker") {
    return <SolidDatePickerFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "dialog") {
    return <SolidDialogFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "drawer") {
    return <SolidDrawerFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "hover-card") {
    return <SolidHoverCardFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "input-group") {
    return <SolidInputGroupFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "splitter") {
    return <SolidSplitterFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "steps") {
    return <SolidStepsFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "navigation-menu") {
    return <SolidNavigationMenuFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "pagination") {
    return <SolidPaginationFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "tree-view") {
    return <SolidTreeViewFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "tags-input") {
    return <SolidTagsInputFixture route={props.route} componentMap={props.componentMap} />;
  }
  if (props.slug === "table") {
    return <SolidTableFixture route={props.route} componentMap={props.componentMap} />;
  }
  const Root = props.componentMap[demo.root.exportName];
  if (!Root) {
    return <Unsupported family="component" slug={props.slug} reason={`Missing Solid export ${demo.root.exportName}`} />;
  }
  return (
    <Dynamic
      component={Root as never}
      {...catalogDemoRootPropsForRoute(props.slug, props.route)}
    >
      {demo.root.voidElement
        ? undefined
        : (() => {
            const children = catalogDemoChildren(demo, demo.root.id)
              .flatMap((part) => renderCatalogDemoPartInstances(props.slug, demo, part, props.componentMap));
            return children.length ? children : catalogDemoRootText(props.slug);
          })()}
    </Dynamic>
  );
}

function SolidBreadcrumbFixture(props: { route: WorkbenchRoute; componentMap: Record<string, unknown> }) {
  const component = (name: string) => props.componentMap[name] as never;
  return (
    <Dynamic component={component("BreadcrumbRoot")} {...catalogDemoRootPropsForRoute("breadcrumb", props.route)}>
      <Dynamic component={component("BreadcrumbList")}>
        <Dynamic component={component("BreadcrumbItem")} value="workspace">
          <Dynamic component={component("BreadcrumbLink")} value="workspace" href="#workspace">Workspace</Dynamic>
        </Dynamic>
        <Dynamic component={component("BreadcrumbSeparator")} value="workspace-projects" />
        <Dynamic component={component("BreadcrumbItem")} value="collapsed">
          <Dynamic component={component("BreadcrumbEllipsis")} />
        </Dynamic>
        <Dynamic component={component("BreadcrumbSeparator")} value="collapsed-projects" />
        <Dynamic component={component("BreadcrumbItem")} value="projects">
          <Dynamic component={component("BreadcrumbLink")} value="projects" href="#projects">Projects</Dynamic>
        </Dynamic>
        <Dynamic component={component("BreadcrumbSeparator")} value="projects-settings" />
        <Dynamic component={component("BreadcrumbItem")} value="settings">
          <Dynamic component={component("BreadcrumbPage")}>Settings</Dynamic>
        </Dynamic>
      </Dynamic>
    </Dynamic>
  );
}

function SolidTableFixture(props: { route: WorkbenchRoute; componentMap: Record<string, unknown> }) {
  const component = (name: string) => props.componentMap[name] as never;
  const [query, setQuery] = createSignal("");
  const [pageIndex, setPageIndex] = createSignal(0);
  const [selected, setSelected] = createSignal<ReadonlySet<string>>(new Set());
  const pageSize = 4;
  const filteredRows = createMemo(() => catalogDeploymentRows.filter((row) => (
    `${row.environment} ${row.release} ${row.status} ${row.region}`.toLowerCase().includes(query().toLowerCase())
  )));
  const pageCount = createMemo(() => Math.max(1, Math.ceil(filteredRows().length / pageSize)));
  const safePage = createMemo(() => Math.min(pageIndex(), pageCount() - 1));
  const rows = createMemo(() => filteredRows().slice(safePage() * pageSize, (safePage() + 1) * pageSize));
  const allVisibleSelected = createMemo(() => rows().length > 0 && rows().every((row) => selected().has(row.id)));
  const toggle = (id: string, checked: boolean) => setSelected((current) => {
    const next = new Set(current);
    checked ? next.add(id) : next.delete(id);
    return next;
  });
  return (
    <div class="catalog-data-table-demo">
      <div class="catalog-data-table-heading">
        <div><strong>Deployments</strong><span>Monitor release health across environments.</span></div>
        <label class="catalog-table-search">
          <span class="sr-only">Filter deployments</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={query()} onInput={(event) => { setQuery(event.currentTarget.value); setPageIndex(0); }} placeholder="Filter deployments…" />
        </label>
      </div>
      <Dynamic component={component("TableRoot")} {...catalogDemoRootPropsForRoute("table", props.route)}>
        <Dynamic component={component("TableTable")}>
          <Dynamic component={component("TableCaption")}>Deployment environments and their current release health.</Dynamic>
          <Dynamic component={component("TableHeader")}>
            <Dynamic component={component("TableRow")} value="header">
              <Dynamic component={component("TableHead")} value="select"><input type="checkbox" aria-label="Select visible deployments" checked={allVisibleSelected()} onChange={(event) => {
                const next = new Set(selected());
                for (const row of rows()) event.currentTarget.checked ? next.add(row.id) : next.delete(row.id);
                setSelected(next);
              }} /></Dynamic>
              <Dynamic component={component("TableHead")} value="environment">Environment</Dynamic>
              <Dynamic component={component("TableHead")} value="release">Release</Dynamic>
              <Dynamic component={component("TableHead")} value="status">Status</Dynamic>
              <Dynamic component={component("TableHead")} value="updated">Updated</Dynamic>
              <Dynamic component={component("TableHead")} value="action"><span class="sr-only">Actions</span></Dynamic>
            </Dynamic>
          </Dynamic>
          <Dynamic component={component("TableBody")}>
            <For each={rows()} fallback={<Dynamic component={component("TableRow")} value="empty"><Dynamic component={component("TableCell")} value="empty" colSpan={6}><div class="catalog-table-empty"><strong>No deployments found</strong><span>Try another environment, release, status, or region.</span></div></Dynamic></Dynamic>}>
              {(row) => <Dynamic component={component("TableRow")} value={row.id}>
                <Dynamic component={component("TableCell")} value={`${row.id}-select`}><input type="checkbox" aria-label={`Select ${row.environment}`} checked={selected().has(row.id)} onChange={(event) => toggle(row.id, event.currentTarget.checked)} /></Dynamic>
                <Dynamic component={component("TableCell")} value={`${row.id}-environment`}><strong>{row.environment}</strong><span class="catalog-table-region">{row.region}</span></Dynamic>
                <Dynamic component={component("TableCell")} value={`${row.id}-release`}><code>{row.release}</code></Dynamic>
                <Dynamic component={component("TableCell")} value={`${row.id}-status`}><span class="catalog-status-badge" data-status={row.status.toLowerCase()}><i />{row.status}</span></Dynamic>
                <Dynamic component={component("TableCell")} value={`${row.id}-updated`}>{row.updated}</Dynamic>
                <Dynamic component={component("TableCell")} value={`${row.id}-action`}><a class="catalog-table-action" href={`#deployment-${row.id}`}>Inspect</a></Dynamic>
              </Dynamic>}
            </For>
          </Dynamic>
          <Dynamic component={component("TableFooter")}>
            <Dynamic component={component("TableRow")} value="summary">
              <Dynamic component={component("TableCell")} value="summary" colSpan={6}><div class="catalog-table-pagination"><span>{selected().size} selected · {filteredRows().length} deployments</span><div><button type="button" disabled={safePage() === 0} onClick={() => setPageIndex((value) => Math.max(0, value - 1))}>Previous</button><span>Page {safePage() + 1} of {pageCount()}</span><button type="button" disabled={safePage() >= pageCount() - 1} onClick={() => setPageIndex((value) => Math.min(pageCount() - 1, value + 1))}>Next</button></div></div></Dynamic>
            </Dynamic>
          </Dynamic>
        </Dynamic>
      </Dynamic>
    </div>
  );
}

function SolidCardFixture(props: { route: WorkbenchRoute; componentMap: Record<string, unknown> }) {
  const component = (name: string) => props.componentMap[name] as never;
  return (
    <Dynamic component={component("CardRoot")} {...catalogDemoRootPropsForRoute("card", props.route)}>
      <Dynamic component={component("CardHeader")}>
        <Dynamic component={component("CardTitle")}><span class="catalog-card-icon" aria-hidden="true"><span /></span><span>Release health</span></Dynamic>
        <Dynamic component={component("CardDescription")}>Production deployment status for Acme Cloud.</Dynamic>
        <Dynamic component={component("CardAction")}><Button variant="ghost" size="sm"><Button.Label>View releases</Button.Label><Button.Icon aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></Button.Icon></Button></Dynamic>
      </Dynamic>
      <Dynamic component={component("CardContent")}><div class="catalog-card-status"><i /><div><strong>All systems operational</strong><span>12 checks passed across 3 regions</span></div></div><dl class="catalog-card-metrics"><div><dt>Version</dt><dd>v2.9.0</dd></div><div><dt>Latency</dt><dd>84 ms</dd></div><div><dt>Errors</dt><dd>0.02%</dd></div></dl></Dynamic>
      <Dynamic component={component("CardFooter")}><div class="catalog-avatar-stack" aria-label="Release owners"><span>AM</span><span>SK</span><span>TR</span></div><span>Deployed 8 minutes ago by Alex Morgan</span></Dynamic>
    </Dynamic>
  );
}

function SolidPaginationFixture(props: { route: WorkbenchRoute; componentMap: Record<string, unknown> }) {
  const component = (name: string) => props.componentMap[name] as never;
  return (
    <Dynamic component={component("PaginationRoot")} {...catalogDemoRootPropsForRoute("pagination", props.route)}>
      <Dynamic component={component("PaginationList")}>
        <li><Dynamic component={component("PaginationPrevious")} type="button">Previous</Dynamic></li>
        <Dynamic component={component("PaginationItem")} value={1}>
          <Dynamic component={component("PaginationPageTrigger")} type="button" value={1}>1</Dynamic>
        </Dynamic>
        <Dynamic component={component("PaginationItem")} value={2}>
          <Dynamic component={component("PaginationPageTrigger")} type="button" value={2}>2</Dynamic>
        </Dynamic>
        <Dynamic component={component("PaginationItem")} value={3}>
          <Dynamic component={component("PaginationPageTrigger")} type="button" value={3}>3</Dynamic>
        </Dynamic>
        <Dynamic component={component("PaginationEllipsis")} value="start">…</Dynamic>
        <Dynamic component={component("PaginationItem")} value={10}>
          <Dynamic component={component("PaginationPageTrigger")} type="button" value={10}>10</Dynamic>
        </Dynamic>
        <li><Dynamic component={component("PaginationNext")} type="button">Next</Dynamic></li>
      </Dynamic>
    </Dynamic>
  );
}

function SolidSkeletonFixture(props: { route: WorkbenchRoute; componentMap: Record<string, unknown> }) {
  const component = props.componentMap.SkeletonRoot as never;
  return (
    <Dynamic component={component} {...catalogDemoRootPropsForRoute("skeleton", props.route)} class="catalog-production-skeleton">
      <span class="catalog-production-skeleton-avatar" />
      <span class="catalog-production-skeleton-copy"><i /><i /><i /></span>
    </Dynamic>
  );
}

function SolidInputGroupFixture(props: { route: WorkbenchRoute; componentMap: Record<string, unknown> }) {
  const component = (name: string) => props.componentMap[name] as never;
  return (
    <Dynamic component={component("InputGroupRoot")} {...catalogDemoRootPropsForRoute("input-group", props.route)}>
      <Dynamic component={component("InputGroupAddon")} value="protocol">
        <Dynamic component={component("InputGroupText")} value="protocol">https://</Dynamic>
      </Dynamic>
      <Dynamic component={component("InputGroupControl")}>
        <Dynamic component={component("InputGroupInput")} aria-label="Project domain" placeholder="project-name" />
        <Dynamic component={component("InputGroupTextarea")} hidden aria-label="Project domain notes" />
      </Dynamic>
      <Dynamic component={component("InputGroupAddon")} value="copy">
        <Dynamic component={component("InputGroupButton")} value="copy" type="button">Copy</Dynamic>
      </Dynamic>
    </Dynamic>
  );
}

function SolidDialogFixture(props: { route: WorkbenchRoute; componentMap: Record<string, unknown> }) {
  const component = (name: string) => props.componentMap[name] as never;
  return (
    <Dynamic component={component("DialogRoot")} {...catalogDemoRootPropsForRoute("dialog", props.route)}>
      <Dynamic component={component("DialogTrigger")} type="button">Edit profile</Dynamic>
      <Dynamic component={component("DialogPortal")}>
        <Dynamic component={component("DialogBackdrop")} />
        <Dynamic component={component("DialogPositioner")}>
          <Dynamic component={component("DialogContent")} class={props.route.fixtureId === "long-content" ? "catalog-dialog-content catalog-dialog-content--long" : "catalog-dialog-content"}>
            <Dynamic component={component("DialogTitle")}>Edit profile</Dynamic>
            <Dynamic component={component("DialogDescription")}>Update the details teammates see across your workspace.</Dynamic>
            <Show when={props.route.fixtureId === "long-content"}>
              <div class="catalog-dialog-long-copy">
                <section><h3>Profile visibility</h3><p>Your name and photo are visible to every member of this workspace and in shared activity.</p></section>
                <section><h3>Contact details</h3><p>Your work email is only shown to workspace owners and administrators who manage access.</p></section>
                <section><h3>Notifications</h3><p>Security and billing notices continue to use the verified account email even when this profile changes.</p></section>
              </div>
            </Show>
            <form class="catalog-dialog-form" onSubmit={(event) => event.preventDefault()}>
              <label>Display name<input name="displayName" value="Alex Morgan" autocomplete="name" /></label>
              <label>Work email<input name="email" type="email" value="alex@company.com" autocomplete="email" /></label>
              <div class="catalog-dialog-actions">
                <button type="button" class="catalog-dialog-cancel">Cancel</button>
                <button type="submit" class="catalog-primary-action">Save changes</button>
              </div>
            </form>
            <Show when={props.route.fixtureId === "nested-overlay"}>
              <Dynamic component={component("DialogRoot")} defaultOpen environment={{ scopeId: "uifn-catalog-dialog-nested", hydrationSeed: "dialog-nested" }}>
                <Dynamic component={component("DialogTrigger")} type="button">Review sharing</Dynamic>
                <Dynamic component={component("DialogPortal")}>
                  <Dynamic component={component("DialogBackdrop")} />
                  <Dynamic component={component("DialogPositioner")}>
                    <Dynamic component={component("DialogContent")} class="catalog-dialog-content catalog-dialog-content--nested">
                      <Dynamic component={component("DialogTitle")}>Share profile changes?</Dynamic>
                      <Dynamic component={component("DialogDescription")}>These updates will be visible to everyone in Acme Cloud.</Dynamic>
                      <div class="catalog-dialog-actions">
                        <Dynamic component={component("DialogClose")} type="button" class="catalog-dialog-cancel catalog-dialog-inline-close">Keep editing</Dynamic>
                        <button type="button" class="catalog-primary-action">Share changes</button>
                      </div>
                    </Dynamic>
                  </Dynamic>
                </Dynamic>
              </Dynamic>
            </Show>
            <Dynamic component={component("DialogClose")} type="button" aria-label="Close dialog" class="catalog-overlay-close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></Dynamic>
          </Dynamic>
        </Dynamic>
      </Dynamic>
    </Dynamic>
  );
}

function SolidDrawerFixture(props: { route: WorkbenchRoute; componentMap: Record<string, unknown> }) {
  const component = (name: string) => props.componentMap[name] as never;
  return (
    <Dynamic component={component("DrawerRoot")} {...catalogDemoRootPropsForRoute("drawer", props.route)}>
      <Dynamic component={component("DrawerTrigger")} type="button">Open filters</Dynamic>
      <Dynamic component={component("DrawerPortal")}>
        <Dynamic component={component("DrawerBackdrop")} />
        <Dynamic component={component("DrawerPositioner")}>
          <Dynamic component={component("DrawerContent")}>
            <Dynamic component={component("DrawerHandle")} aria-hidden="true" />
            <Dynamic component={component("DrawerTitle")}>Filter activity</Dynamic>
            <Dynamic component={component("DrawerDescription")}>Narrow the workspace feed without leaving the page.</Dynamic>
            <form class="catalog-drawer-form" onSubmit={(event) => event.preventDefault()}>
              <fieldset>
                <legend>Activity type</legend>
                <label><input type="checkbox" checked /> Deployments</label>
                <label><input type="checkbox" checked /> Pull requests</label>
                <label><input type="checkbox" /> Team updates</label>
              </fieldset>
              <label>Member<select value="any"><option value="any">Anyone</option><option>Alex Morgan</option><option>Sam Rivera</option></select></label>
              <button type="submit" class="catalog-primary-action">Apply filters</button>
            </form>
            <Dynamic component={component("DrawerClose")} type="button" aria-label="Close filters" class="catalog-overlay-close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></Dynamic>
          </Dynamic>
        </Dynamic>
      </Dynamic>
    </Dynamic>
  );
}

function SolidHoverCardFixture(props: { route: WorkbenchRoute; componentMap: Record<string, unknown> }) {
  const component = (name: string) => props.componentMap[name] as never;
  return (
    <Dynamic component={component("HoverCardRoot")} {...catalogDemoRootPropsForRoute("hover-card", props.route)}>
      <Dynamic component={component("HoverCardTrigger")} href="#preview">@alex</Dynamic>
      <Dynamic component={component("HoverCardPositioner")}>
        <Dynamic component={component("HoverCardContent")}>
          <Dynamic component={component("HoverCardArrow")} />
          <div class="catalog-profile-card">
            <span class="catalog-profile-avatar" aria-hidden="true">AM</span>
            <div><strong>Alex Morgan</strong><span>Frontend infrastructure</span></div>
            <p>Building accessible platform primitives for the design systems team.</p>
            <dl><div><dt>Projects</dt><dd>42</dd></div><div><dt>Following</dt><dd>128</dd></div></dl>
          </div>
        </Dynamic>
      </Dynamic>
    </Dynamic>
  );
}

function SolidColorPickerFixture(props: {
  route: WorkbenchRoute;
  componentMap: Record<string, unknown>;
}) {
  const component = (name: string) => props.componentMap[name] as never;
  const channels = [
    { value: "r", label: "Red" },
    { value: "g", label: "Green" },
    { value: "b", label: "Blue" },
    { value: "alpha", label: "Alpha" },
  ];
  return (
    <Dynamic component={component("ColorPickerRoot")} {...catalogDemoRootPropsForRoute("color-picker", props.route)}>
      <Dynamic component={component("ColorPickerLabel")}>Brand color</Dynamic>
      <Dynamic component={component("ColorPickerControl")}>
        <Dynamic component={component("ColorPickerTrigger")} type="button">
          <Dynamic component={component("ColorPickerSwatch")} aria-hidden="true" />
          <span>Custom color</span>
        </Dynamic>
      </Dynamic>
      <Dynamic component={component("ColorPickerPositioner")}>
        <Dynamic component={component("ColorPickerContent")}>
          <Dynamic component={component("ColorPickerArea")}>
            <Dynamic component={component("ColorPickerAreaThumb")} tabIndex={0} />
          </Dynamic>
          <div class="catalog-color-picker-channels">
            <For each={channels}>{(channel) => (
              <label>
                <span>{channel.label}</span>
                <Dynamic component={component("ColorPickerChannelSlider")} value={channel.value} tabIndex={0} />
                <Dynamic component={component("ColorPickerChannelInput")} value={channel.value} inputMode="decimal" />
              </label>
            )}</For>
          </div>
        </Dynamic>
      </Dynamic>
      <Dynamic component={component("ColorPickerHiddenInput")} />
    </Dynamic>
  );
}

function SolidDatePickerFixture(props: {
  route: WorkbenchRoute;
  componentMap: Record<string, unknown>;
}) {
  const Root = props.componentMap.DatePickerRoot;
  const Label = props.componentMap.DatePickerLabel;
  const Input = props.componentMap.DatePickerInput;
  const Segment = props.componentMap.DatePickerSegment;
  const Trigger = props.componentMap.DatePickerTrigger;
  const Positioner = props.componentMap.DatePickerPositioner;
  const Content = props.componentMap.DatePickerContent;
  const Header = props.componentMap.DatePickerHeader;
  const Previous = props.componentMap.DatePickerPrevious;
  const Next = props.componentMap.DatePickerNext;
  const Grid = props.componentMap.DatePickerGrid;
  const GridLabel = props.componentMap.DatePickerGridLabel;
  const Cell = props.componentMap.DatePickerCell;
  const CellTrigger = props.componentMap.DatePickerCellTrigger;
  const HiddenInput = props.componentMap.DatePickerHiddenInput;
  const rows = Array.from({ length: 6 }, (_, row) => (
    Array.from({ length: 7 }, (_, column) => {
      const value = new Date(Date.UTC(2026, 5, 28 + row * 7 + column));
      return { key: value.toISOString().slice(0, 10), day: value.getUTCDate() };
    })
  ));
  return (
    <Dynamic component={Root as never} {...catalogDemoRootPropsForRoute("date-picker", props.route)}>
      <Dynamic component={Label as never}>Due date</Dynamic>
      <div class="catalog-date-picker-control">
        <Dynamic component={Input as never}>
          <Dynamic component={Segment as never} value="month">07</Dynamic>
          <span aria-hidden="true">/</span>
          <Dynamic component={Segment as never} value="day">22</Dynamic>
          <span aria-hidden="true">/</span>
          <Dynamic component={Segment as never} value="year">2026</Dynamic>
        </Dynamic>
        <Dynamic component={Trigger as never} type="button" aria-label="Open calendar">Calendar</Dynamic>
      </div>
      <Dynamic component={Positioner as never}>
        <Dynamic component={Content as never}>
          <Dynamic component={Header as never}>
            <Dynamic component={Previous as never} type="button" aria-label="Previous month">‹</Dynamic>
            <strong>July 2026</strong>
            <Dynamic component={Next as never} type="button" aria-label="Next month">›</Dynamic>
          </Dynamic>
          <Dynamic component={Grid as never}>
            <Dynamic component={GridLabel as never}>July 2026</Dynamic>
            <thead>
              <tr><For each={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]}>{(day) => <th scope="col">{day}</th>}</For></tr>
            </thead>
            <tbody>
              <For each={rows}>{(row) => (
                <tr>
                  <For each={row}>{(date) => (
                    <Dynamic component={Cell as never} value={date.key}>
                      <Dynamic component={CellTrigger as never} type="button" value={date.key}>{date.day}</Dynamic>
                    </Dynamic>
                  )}</For>
                </tr>
              )}</For>
            </tbody>
          </Dynamic>
        </Dynamic>
      </Dynamic>
      <Dynamic component={HiddenInput as never} />
    </Dynamic>
  );
}

function SolidSplitterFixture(props: {
  route: WorkbenchRoute;
  componentMap: Record<string, unknown>;
}) {
  const required = [
    "SplitterRoot",
    "SplitterPanel",
    "SplitterResizeTrigger",
    "SplitterResizeHandle",
  ];
  if (required.some((name) => !props.componentMap[name])) {
    return <Unsupported family="component" slug="splitter" reason="Incomplete Solid Splitter exports" />;
  }
  return (
    <Dynamic
      component={props.componentMap.SplitterRoot as never}
      {...catalogDemoRootPropsForRoute("splitter", props.route)}
      aria-label="Workspace layout"
    >
      <Dynamic component={props.componentMap.SplitterPanel as never} value={0}>Navigation</Dynamic>
      <Dynamic component={props.componentMap.SplitterResizeTrigger as never} value={0} />
      <Dynamic component={props.componentMap.SplitterResizeHandle as never} value={0} />
      <Dynamic component={props.componentMap.SplitterPanel as never} value={1}>Editor</Dynamic>
    </Dynamic>
  );
}

function SolidStepsFixture(props: {
  route: WorkbenchRoute;
  componentMap: Record<string, unknown>;
}) {
  const required = [
    "StepsRoot",
    "StepsList",
    "StepsItem",
    "StepsTrigger",
    "StepsIndicator",
    "StepsSeparator",
    "StepsContent",
    "StepsCompleted",
  ];
  if (required.some((name) => !props.componentMap[name])) {
    return <Unsupported family="component" slug="steps" reason="Incomplete Solid Steps exports" />;
  }
  const labels = ["Account", "Profile", "Review"];
  const descriptions = [
    "Create your account.",
    "Complete your profile.",
    "Review and submit.",
  ];
  return (
    <Dynamic
      component={props.componentMap.StepsRoot as never}
      {...catalogDemoRootPropsForRoute("steps", props.route)}
      aria-label="Account setup"
    >
      <Dynamic component={props.componentMap.StepsList as never}>
        <For each={labels}>
          {(label, index) => (
            <Dynamic component={props.componentMap.StepsItem as never} value={index()}>
              <Dynamic component={props.componentMap.StepsIndicator as never} value={index()}>
                {index() + 1}
              </Dynamic>
              <Dynamic component={props.componentMap.StepsCompleted as never} value={index()}>
                ✓
              </Dynamic>
              <Dynamic component={props.componentMap.StepsTrigger as never} type="button" value={index()}>
                {label}
              </Dynamic>
              <Dynamic component={props.componentMap.StepsSeparator as never} value={index()} />
            </Dynamic>
          )}
        </For>
      </Dynamic>
      <For each={descriptions}>
        {(description, index) => (
          <Dynamic component={props.componentMap.StepsContent as never} value={index()}>
            {description}
          </Dynamic>
        )}
      </For>
    </Dynamic>
  );
}

function SolidTreeViewFixture(props: {
  route: WorkbenchRoute;
  componentMap: Record<string, unknown>;
}) {
  const required = [
    "TreeViewRoot",
    "TreeViewLabel",
    "TreeViewTree",
    "TreeViewItem",
    "TreeViewItemTrigger",
    "TreeViewItemText",
    "TreeViewBranch",
    "TreeViewIndicator",
  ];
  if (required.some((name) => !props.componentMap[name])) {
    return <Unsupported family="component" slug="tree-view" reason="Incomplete Solid TreeView exports" />;
  }
  return (
    <Dynamic
      component={props.componentMap.TreeViewRoot as never}
      {...catalogDemoRootPropsForRoute("tree-view", props.route)}
    >
      <Dynamic component={props.componentMap.TreeViewLabel as never}>Project files</Dynamic>
      <Dynamic component={props.componentMap.TreeViewTree as never}>
        <Dynamic component={props.componentMap.TreeViewItem as never} value="item-1">
          <Dynamic
            component={props.componentMap.TreeViewItemTrigger as never}
            type="button"
            value="item-1"
            aria-label="Toggle Workspace"
          >›</Dynamic>
          <Dynamic component={props.componentMap.TreeViewItemText as never} value="item-1">Workspace</Dynamic>
          <Dynamic component={props.componentMap.TreeViewBranch as never} value="item-1">
            <Dynamic component={props.componentMap.TreeViewItem as never} value="item-2">
              <Dynamic
                component={props.componentMap.TreeViewItemTrigger as never}
                type="button"
                value="item-2"
                aria-label="Projects"
              >›</Dynamic>
              <Dynamic component={props.componentMap.TreeViewItemText as never} value="item-2">Projects</Dynamic>
              <Dynamic component={props.componentMap.TreeViewBranch as never} value="item-2" />
              <Dynamic component={props.componentMap.TreeViewIndicator as never} value="item-2">⌄</Dynamic>
            </Dynamic>
          </Dynamic>
          <Dynamic component={props.componentMap.TreeViewIndicator as never} value="item-1">⌄</Dynamic>
        </Dynamic>
      </Dynamic>
    </Dynamic>
  );
}

function SolidFormFixture(props: {
  route: WorkbenchRoute;
  componentMap: Record<string, unknown>;
}) {
  const required = ["FormRoot", "FormErrorSummary", "FormActions"];
  if (required.some((name) => !props.componentMap[name])) {
    return <Unsupported family="component" slug="form" reason="Incomplete Solid Form exports" />;
  }
  return (
    <Dynamic
      component={props.componentMap.FormRoot as never}
      {...catalogDemoRootPropsForRoute("form", props.route)}
    >
      <div class="catalog-form-field">
        <label for="solid-workspace-name">Workspace name</label>
        <input
          id="solid-workspace-name"
          name="workspaceName"
          value="Acme Design"
          autocomplete="organization"
          required
        />
        <span>Used in navigation, invitations, and shared links.</span>
      </div>
      <Dynamic component={props.componentMap.FormErrorSummary as never} />
      <Dynamic component={props.componentMap.FormActions as never}>
        <button type="button" class="catalog-secondary-action">Cancel</button>
        <button type="submit" class="catalog-primary-action">Save workspace</button>
      </Dynamic>
    </Dynamic>
  );
}

function SolidFieldFixture(props: {
  route: WorkbenchRoute;
  componentMap: Record<string, unknown>;
}) {
  const required = [
    "FieldRoot",
    "FieldLabel",
    "FieldControl",
    "FieldDescription",
    "FieldError",
    "FieldRequiredIndicator",
  ];
  if (required.some((name) => !props.componentMap[name])) {
    return <Unsupported family="component" slug="field" reason="Incomplete Solid Field exports" />;
  }
  return (
    <Dynamic
      component={props.componentMap.FieldRoot as never}
      {...catalogDemoRootPropsForRoute("field", props.route)}
      required
    >
      <Dynamic component={props.componentMap.FieldLabel as never} for="solid-work-email">
        Work email <Dynamic component={props.componentMap.FieldRequiredIndicator as never}>*</Dynamic>
      </Dynamic>
      <Dynamic component={props.componentMap.FieldControl as never}>
        <input
          id="solid-work-email"
          class="catalog-field-input"
          name="email"
          type="email"
          placeholder="you@company.com"
          autocomplete="email"
          aria-describedby="solid-work-email-description"
          required
        />
      </Dynamic>
      <Dynamic
        component={props.componentMap.FieldDescription as never}
        id="solid-work-email-description"
      >
        We will only use this for account notifications.
      </Dynamic>
      <Dynamic component={props.componentMap.FieldError as never} />
    </Dynamic>
  );
}

function SolidFieldsetFixture(props: {
  route: WorkbenchRoute;
  componentMap: Record<string, unknown>;
}) {
  const required = [
    "FieldsetRoot",
    "FieldsetLegend",
    "FieldsetContent",
    "FieldsetDescription",
    "FieldsetError",
  ];
  if (required.some((name) => !props.componentMap[name])) {
    return <Unsupported family="component" slug="fieldset" reason="Incomplete Solid Fieldset exports" />;
  }
  return (
    <Dynamic
      component={props.componentMap.FieldsetRoot as never}
      {...catalogDemoRootPropsForRoute("fieldset", props.route)}
    >
      <Dynamic component={props.componentMap.FieldsetLegend as never}>Workspace notifications</Dynamic>
      <Dynamic component={props.componentMap.FieldsetDescription as never}>
        Choose which updates your team should receive.
      </Dynamic>
      <Dynamic component={props.componentMap.FieldsetContent as never}>
        <label class="catalog-fieldset-option">
          <input type="checkbox" checked /> Product updates
        </label>
        <label class="catalog-fieldset-option">
          <input type="checkbox" /> Security alerts
        </label>
      </Dynamic>
      <Dynamic component={props.componentMap.FieldsetError as never} />
    </Dynamic>
  );
}

function SolidNavigationMenuFixture(props: {
  route: WorkbenchRoute;
  componentMap: Record<string, unknown>;
}) {
  const required = [
    "NavigationMenuRoot",
    "NavigationMenuList",
    "NavigationMenuItem",
    "NavigationMenuTrigger",
    "NavigationMenuContent",
    "NavigationMenuLink",
    "NavigationMenuViewport",
    "NavigationMenuIndicator",
  ];
  if (required.some((name) => !props.componentMap[name])) {
    return <Unsupported family="component" slug="navigation-menu" reason="Incomplete Solid NavigationMenu exports" />;
  }
  const entries = [
    { value: "item-1", trigger: "Products", link: "Product overview", description: "Explore primitives, recipes, and production-ready components.", href: "#products" },
    { value: "item-2", trigger: "Resources", link: "Documentation", description: "Learn the APIs, accessibility model, and framework adapters.", href: "#documentation" },
    { value: "item-3", trigger: "Company", link: "About uifn", description: "Meet the team building the cross-framework UI foundation.", href: "#company" },
  ];
  return (
    <Dynamic
      component={props.componentMap.NavigationMenuRoot as never}
      {...catalogDemoRootPropsForRoute("navigation-menu", props.route)}
    >
      <Dynamic component={props.componentMap.NavigationMenuList as never}>
        <For each={entries}>
          {(entry) => (
            <Dynamic component={props.componentMap.NavigationMenuItem as never} value={entry.value}>
              <Dynamic component={props.componentMap.NavigationMenuTrigger as never} type="button" value={entry.value}>
                {entry.trigger}
              </Dynamic>
              <Dynamic component={props.componentMap.NavigationMenuContent as never} value={entry.value}>
                <Dynamic class="catalog-navigation-card" component={props.componentMap.NavigationMenuLink as never} value={entry.value} href={entry.href}>
                  <strong>{entry.link}</strong>
                  <span>{entry.description}</span>
                </Dynamic>
              </Dynamic>
            </Dynamic>
          )}
        </For>
      </Dynamic>
      <Dynamic component={props.componentMap.NavigationMenuViewport as never} />
      <Dynamic component={props.componentMap.NavigationMenuIndicator as never} />
    </Dynamic>
  );
}

function SolidTagsInputFixture(props: {
  route: WorkbenchRoute;
  componentMap: Record<string, unknown>;
}) {
  const [values, setValues] = createSignal(["item-1", "item-2"]);
  const required = [
    "TagsInputRoot",
    "TagsInputLabel",
    "TagsInputControl",
    "TagsInputItem",
    "TagsInputItemText",
    "TagsInputItemDelete",
    "TagsInputInput",
    "TagsInputClear",
    "TagsInputHiddenInput",
    "TagsInputError",
  ];
  if (required.some((name) => !props.componentMap[name])) {
    return <Unsupported family="component" slug="tags-input" reason="Incomplete Solid TagsInput exports" />;
  }
  return (
    <Dynamic
      component={props.componentMap.TagsInputRoot as never}
      {...catalogDemoRootPropsForRoute("tags-input", props.route)}
      value={values()}
      onValueChange={(next: unknown) => setValues(Array.isArray(next) ? next.map(String) : [])}
    >
      <Dynamic component={props.componentMap.TagsInputLabel as never}>Release tags</Dynamic>
      <Dynamic component={props.componentMap.TagsInputControl as never}>
        <For each={values()}>
          {(value) => (
            <Dynamic component={props.componentMap.TagsInputItem as never} value={value}>
              <Dynamic component={props.componentMap.TagsInputItemText as never} value={value}>
                {value === "item-1" ? "Frontend" : value === "item-2" ? "Stable" : value}
              </Dynamic>
              <Dynamic component={props.componentMap.TagsInputItemDelete as never} value={value} aria-label={`Remove ${value}`}><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></Dynamic>
            </Dynamic>
          )}
        </For>
        <Dynamic component={props.componentMap.TagsInputInput as never} aria-label="Add tag" placeholder="Add a tag" />
      </Dynamic>
      <Dynamic component={props.componentMap.TagsInputClear as never}>Clear all tags</Dynamic>
      <For each={values()}>
        {(value) => <Dynamic component={props.componentMap.TagsInputHiddenInput as never} value={value} />}
      </For>
      <Dynamic component={props.componentMap.TagsInputError as never} />
    </Dynamic>
  );
}

function renderCatalogDemoPartInstances(
  slug: ComponentSlug,
  demo: CatalogComponentDemo,
  part: CatalogDemoPart,
  componentMap: Record<string, unknown>,
  inheritedIndex = 0,
): JSX.Element[] {
  return catalogDemoPartInstances(part).map((ownIndex) => {
    const instanceIndex = part.repeat > 1 ? ownIndex : inheritedIndex;
    return renderCatalogDemoPart(slug, demo, part, componentMap, instanceIndex);
  });
}

function renderCatalogDemoPart(
  slug: ComponentSlug,
  demo: CatalogComponentDemo,
  part: CatalogDemoPart,
  componentMap: Record<string, unknown>,
  instanceIndex: number,
): JSX.Element {
  const Part = componentMap[part.exportName];
  if (!Part) return <span data-uifn-demo-missing={part.exportName}>Missing {part.exportName}</span>;
  const descendants = catalogDemoChildren(demo, part.id);
  const regularDescendants = descendants.filter((child) => child.element !== "td");
  const cellDescendants = descendants.filter((child) => child.element === "td");
  const children = (() => {
    const rendered: JSX.Element[] = [];
    const text = catalogDemoPartText(slug, part, instanceIndex);
    if (text) rendered.push(text);
    rendered.push(...regularDescendants.flatMap((child) => renderCatalogDemoPartInstances(slug, demo, child, componentMap, instanceIndex)));
    if (cellDescendants.length) {
      rendered.push(<tbody><tr>{cellDescendants.flatMap((child) => renderCatalogDemoPartInstances(slug, demo, child, componentMap, instanceIndex))}</tr></tbody>);
    }
    if (
      !rendered.length &&
      catalogDemoShouldAddFallbackText(slug, part)
    ) rendered.push(`${part.id} example`);
    return rendered;
  })();
  const usesControllerDefaultContent = (slug === "select" && part.id === "valueText")
    || (slug === "qr-code" && part.id === "image");
  if (usesControllerDefaultContent) {
    return (
      <Dynamic
        component={Part as never}
        {...catalogDemoPartProps(slug, part, instanceIndex)}
        data-uifn-catalog-anatomy={part.id}
      />
    );
  }
  return (
    <Dynamic
      component={Part as never}
      {...catalogDemoPartProps(slug, part, instanceIndex)}
      data-uifn-catalog-anatomy={part.id}
    >
      {part.voidElement ? undefined : children}
    </Dynamic>
  );
}

function ModelCard(props: { family: "pattern" | "sf"; slug: string; name: string; status: string; model: PatternRenderModel & Record<string, unknown> }) {
  const html = patternModelHtml({
    family: props.family,
    slug: props.slug,
    name: props.name,
    status: props.status as never,
    itemCount: props.model.state.itemCount,
    callbacks: props.model.callbacks,
    data: props.model.data,
    backendImports: props.model.backendImports,
    metadata: props.family === "sf" ? {
      superfunction: props.model.superfunction,
      controlledCounterpart: props.model.controlledCounterpart,
      usesInjectedClient: String(props.model.usesInjectedClient),
      clientType: "fake",
      clientCallCount: props.model.clientCallCount,
    } : undefined,
  });
  return <div innerHTML={html} />;
}

function PatternFixture(props: { slug: string; route: WorkbenchRoute }) {
  const pattern = getPatternBySlug(props.slug);
  if (!pattern) return <Unsupported family="pattern" slug={props.slug} reason="Unknown pattern" />;
  const renderPattern = patternMap[pattern.name];
  if (!renderPattern) return <Unsupported family="pattern" slug={props.slug} reason={`Missing pattern export ${pattern.name}`} />;
  const status = getStatusFromRoute(props.route);
  const model = renderPattern(patternProps(pattern.name as PatternName, status));
  return <ModelCard family="pattern" slug={props.slug} name={pattern.name} status={status} model={model} />;
}

function SfFixture(props: { slug: string; route: WorkbenchRoute }) {
  const panel = getSfPanelBySlug(props.slug);
  const [model, setModel] = createSignal<(PatternRenderModel & Record<string, unknown>) | null>(null);
  const status = () => getStatusFromRoute(props.route);
  createEffect(() => {
    const current = panel;
    if (!current) return;
    const renderPanel = sfMap[current.name];
    if (!renderPanel) return;
    const sfClients = sf.createMockSuperfunctionClients();
    void renderPanel({
      status: status(),
      authClient: sfClients.authClient,
      plugClient: sfClients.plugClient,
      fileClient: sfClients.fileClient,
      billClient: sfClients.billClient,
    }).then((rendered) => {
      const callSummary = sfClients.getCallSummary();
      setModel({
        ...rendered,
        clientCallSummary: callSummary,
        clientCallCount: Object.values(callSummary).reduce((sum, value) => sum + Number(value), 0),
      });
    });
  });
  if (!panel) return <Unsupported family="sf" slug={props.slug} reason="Unknown SF panel" />;
  return (
    <Show when={model()} fallback={<article data-uifn-sf={props.slug} data-status="loading">Loading {panel.name}</article>}>
      {(resolved) => <ModelCard family="sf" slug={props.slug} name={panel.name} status={status()} model={resolved()} />}
    </Show>
  );
}

function RouteCards(props: { routes: string[]; basePath: string; navigate: (path: string) => void }) {
  return (
    <div class="route-grid">
      <For each={props.routes}>{(path) => {
        const route = parseWorkbenchPath(path);
        return (
          <a class="route-card" href={withCatalogBasePath(props.basePath, path)} onClick={(event) => { event.preventDefault(); props.navigate(path); }}>
            <strong>{route.title}</strong><br /><code>{path}</code>
          </a>
        );
      }}</For>
    </div>
  );
}

function Gallery(props: { route: WorkbenchRoute; basePath: string; navigate: (path: string) => void }) {
  const routes = () => {
    if (props.route.path === "/" || props.route.path === "/components") return workbenchComponents.map((component) => `/components/${component.slug}`);
    if (props.route.path === "/scenarios") return workbenchScenarios.map((scenario) => `/scenarios/${scenario.slug}`);
    if (props.route.path === "/patterns") return workbenchPatterns.map((pattern) => `/patterns/${pattern.slug}`);
    if (props.route.path === "/sf") return workbenchSfPanels.map((panel) => `/sf/${panel.slug}`);
    return workbenchRoutes.filter((candidate) => candidate.contract).slice(0, 160).map((candidate) => candidate.path);
  };
  return <RouteCards routes={routes()} basePath={props.basePath} navigate={props.navigate} />;
}

function RouteContent(props: { internalPath: string; route: WorkbenchRoute; basePath: string; navigate: (path: string) => void }) {
  if (props.route.family === "guide") {
    return <div innerHTML={catalogGuideHtml(props.internalPath, "solid", props.basePath)} />;
  }
  if (props.internalPath === "/hooks") {
    return (
      <div class="route-grid">
        <For each={catalogHooks}>{(hook) => (
          <a
            class="route-card"
            href={withCatalogBasePath(props.basePath, `/hooks/${hook.slug}`)}
            onClick={(event) => {
              event.preventDefault();
              props.navigate(`/hooks/${hook.slug}`);
            }}
          >
            <strong>{hook.displayName}</strong><br /><span>{hook.description}</span>
          </a>
        )}</For>
      </div>
    );
  }
  if (props.internalPath.startsWith("/hooks/")) {
    return <HookFixture slug={props.internalPath.slice("/hooks/".length)} />;
  }
  if (props.route.family === "component" && props.route.slug) {
    const component = getComponentBySlug(props.route.slug);
    if (!component && props.route.slug !== "combobox") return <Unsupported family="component" slug={props.route.slug} reason="Unknown component route" />;
    const routes = props.route.path.endsWith("/states")
      ? catalogDemoFixtureIds((component?.slug ?? "combobox") as ComponentSlug, component ? component.states.slice(0, 8) : ["default", "open", "disabled", "invalid"]).map((state) => ({ ...props.route, fixtureId: state }))
      : props.route.path.endsWith("/qa") && props.route.contract
        ? props.route.contract.fixtures.map((fixture) => ({ ...props.route, path: fixture.route, fixtureId: fixture.id }))
        : [props.route];
    return (
      <div class="catalog-component-page">
        <div class="catalog-demo-tabs" data-catalog-demo-tabs>
          <div class="catalog-preview-toolbar">
            <div class="catalog-preview-tabs" role="tablist" aria-label={`${props.route.title} example`}>
              <button type="button" role="tab" aria-selected="true" aria-controls={`preview-${props.route.slug}`} data-catalog-demo-tab="preview"><i></i> Preview</button>
              <button type="button" role="tab" aria-selected="false" aria-controls={`preview-code-${props.route.slug}`} data-catalog-demo-tab="code">Code</button>
            </div>
            <a href={withCatalogBasePath(props.basePath, `/components/${props.route.slug}/states`)}>States</a>
            <a href={withCatalogBasePath(props.basePath, `/components/${props.route.slug}/qa`)}>QA cases</a>
          </div>
          <div id={`preview-${props.route.slug}`} role="tabpanel" data-catalog-demo-panel="preview">
            <h2 class="sr-only">{props.route.title} preview</h2>
            <div
              class="fixture-grid"
              data-catalog-state-grid={routes.length > 1 ? "true" : undefined}
            >
              <For each={routes}>{(fixtureRoute) => (
                <section class="fixture-card">
                  <p class="eyebrow">{catalogDemoFixtureLabel(fixtureRoute.fixtureId)}</p>
                  <ComponentFixture slug={(component?.slug ?? "combobox") as ComponentSlug | "combobox"} route={fixtureRoute} />
                </section>
              )}</For>
            </div>
          </div>
          <div id={`preview-code-${props.route.slug}`} class="catalog-demo-code" role="tabpanel" data-catalog-demo-panel="code" hidden>
            <div innerHTML={catalogDemoCodeHtml(props.route.slug, "solid")} />
          </div>
        </div>
        <Show when={props.route.path === `/components/${props.route.slug}`}>
          <div innerHTML={catalogComponentDetailsHtml(props.route.slug, "solid", props.basePath)} />
        </Show>
      </div>
    );
  }
  if (props.route.family === "pattern" && props.route.slug) return <PatternFixture slug={props.route.slug} route={props.route} />;
  if (props.route.family === "sf" && props.route.slug) return <SfFixture slug={props.route.slug} route={props.route} />;
  if (props.route.family === "scenario" && props.route.slug) {
    const scenario = getScenarioBySlug(props.route.slug);
    if (!scenario) return <Unsupported family="scenario" slug={props.route.slug} reason="Unknown scenario route" />;
    return <div innerHTML={scenarioModelHtml(scenario)} />;
  }
  if (props.route.path === "/" || props.route.path === "/components") {
    return <div innerHTML={catalogComponentGalleryHtml(props.basePath, "solid")} />;
  }
  return <Gallery route={props.route} basePath={props.basePath} navigate={props.navigate} />;
}

export function App(props: { basePath?: string } = {}) {
  const basePath = props.basePath ?? "";
  const [internalPath, route, navigate] = createRouteSignal(basePath);
  const theme = createMemo(() => new URLSearchParams(window.location.search).get("theme") || "light");
  const currentHook = createMemo(() => internalPath().startsWith("/hooks/") ? getCatalogHookBySlug(internalPath().slice("/hooks/".length)) : undefined);
  const pageTitle = createMemo(() => catalogPageTitle(internalPath(), internalPath() === "/hooks" ? "Hooks" : currentHook()?.displayName ?? route().title));
  const pageDescription = createMemo(() => catalogPageDescription(internalPath(), route(), "solid"));
  const pageKind = createMemo(() => catalogPageKind(internalPath(), route()));
  let shellElement: HTMLDivElement | undefined;
  let deactivate: (() => void) | undefined;
  createEffect(() => {
    const current = route();
    const currentPath = internalPath();
    const title = pageTitle();
    const description = pageDescription();
    updateCatalogDocumentMetadata(title, description, "solid", currentPath);
    queueMicrotask(() => {
      deactivate?.();
      if (!shellElement) return;
      activateCatalogUi(shellElement, {
        basePath,
        currentPath,
        navigate,
      });
      deactivate = currentPath.startsWith("/hooks")
        ? undefined
        : activateWorkbenchRoute(shellElement, current, { framework: "solid" });
    });
  });
  onCleanup(() => deactivate?.());
  return (
    <div ref={shellElement} class="workbench-shell" style={catalogThemeStyle(theme())} data-uifn-workbench="solid" data-uifn-loaded="true" data-uifn-theme={theme()}>
      <Nav basePath={basePath} />
      <main class="workbench-main" aria-labelledby="route-title" data-catalog-page={pageKind()}>
        <div class="catalog-topbar-host" innerHTML={catalogTopbarHtml(basePath, "solid", internalPath())} />
        <header class="catalog-page-header">
          <p class="eyebrow">{catalogFrameworkLabel("solid")} · uifn</p>
          <h1 id="route-title">{pageTitle()}</h1>
          <p>{pageDescription()}</p>
        </header>
        <RouteContent internalPath={internalPath()} route={route()} basePath={basePath} navigate={navigate} />
        <footer class="catalog-site-footer"><span>uifn · actual components, three native frameworks</span><a href="/components/">All frameworks</a></footer>
      </main>
    </div>
  );
}

const rootElement = typeof document === "undefined" ? null : document.getElementById("root");
if (rootElement) {
  render(() => <App />, rootElement);
}
