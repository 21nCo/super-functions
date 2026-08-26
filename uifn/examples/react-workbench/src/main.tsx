import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@uifn/components-react/button";
import { useCopyToClipboard } from "@uifn/react/hooks/use-copy-to-clipboard";
import { useMediaQuery } from "@uifn/react/hooks/use-media-query";
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
import { reactComponentLoaders } from "./component-loaders";
import "@uifn/components/styles.css";
import "./styles.css";
import "./catalog.css";

type ComponentMap = Record<string, React.ComponentType<Record<string, unknown>>>;
type PatternMap = Record<string, (props: Record<string, unknown>) => PatternRenderModel>;
type CatalogModel = PatternRenderModel & {
  superfunction?: unknown;
  controlledCounterpart?: unknown;
  usesInjectedClient?: unknown;
  clientCallSummary?: Record<string, number>;
  clientCallCount?: unknown;
};
type SfMap = Record<string, (props: Record<string, unknown>) => Promise<CatalogModel>>;

const patternMap = patterns as unknown as PatternMap;
const sfMap = sf as unknown as SfMap;

function useRoute(basePath: string) {
  const [path, setPath] = useState(() => stripCatalogBasePath(window.location.pathname, basePath));
  useEffect(() => {
    const onPop = () => setPath(stripCatalogBasePath(window.location.pathname, basePath));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [basePath]);
  return [path, parseWorkbenchPath(path), (next: string) => {
    window.history.pushState(null, "", withCatalogBasePath(basePath, next));
    setPath(next);
  }] as const;
}

const Nav = React.memo(function Nav({ basePath }: { basePath: string }) {
  const html = useMemo(
    () => catalogSidebarHtml(
      basePath,
      "react",
      stripCatalogBasePath(window.location.pathname, basePath),
    ),
    [basePath],
  );
  return <div className="catalog-sidebar-host" dangerouslySetInnerHTML={{ __html: html }} />;
});

function HookFixture({ slug }: { slug: string }) {
  const hook = getCatalogHookBySlug(slug);
  const matches = useMediaQuery("(min-width: 768px)", { defaultValue: false });
  const clipboard = useCopyToClipboard();

  if (!hook) return <Unsupported family="hook" slug={slug} reason="Unknown hook" />;

  if (hook.slug === "use-media-query") {
    return (
      <article className="fixture-card" data-uifn-hook={hook.slug}>
        <p className="eyebrow">Live browser result</p>
        <h2>{hook.displayName}</h2>
        <p>{hook.description}</p>
        <output aria-live="polite">Viewport is {matches ? "at least" : "below"} 768px.</output>
      </article>
    );
  }

  return (
    <article className="fixture-card" data-uifn-hook={hook.slug}>
      <p className="eyebrow">Interactive hook</p>
      <h2>{hook.displayName}</h2>
      <p>{hook.description}</p>
      <button type="button" onClick={() => void clipboard.copy("Copied from the React uifn catalog")}>
        Copy catalog text
      </button>
      <p aria-live="polite">Status: {clipboard.status}; copied: {clipboard.copiedText ?? "nothing yet"}</p>
    </article>
  );
}

function ComponentFixture({ slug, route }: { slug: ComponentSlug | "combobox"; route: WorkbenchRoute }) {
  const fixtureCase = route.fixtureId ?? "default";
  if (slug === "button") {
    return <InteractiveButtonFixture props={catalogDemoRootPropsForRoute(slug, route)} fixtureCase={fixtureCase} />;
  }
  return (
    <div
      className="qa-edge-box"
      data-case={fixtureCase}
      data-catalog-preview-size={["card", "table", "command"].includes(slug) ? "large" : undefined}
    >
      {slug === "tour" ? (
        <button id="uifn-tour-target" type="button">Tour target</button>
      ) : null}
      <CanonicalComponentFixture slug={slug} route={route} />
    </div>
  );
}

function CanonicalComponentFixture({ slug, route }: { slug: ComponentSlug; route: WorkbenchRoute }) {
  const [componentMap, setComponentMap] = useState<ComponentMap | null>(null);
  useEffect(() => {
    let active = true;
    setComponentMap(null);
    const loader = reactComponentLoaders[slug];
    if (!loader) return () => { active = false; };
    void loader().then((loaded) => {
      if (active) setComponentMap(loaded as unknown as ComponentMap);
    });
    return () => { active = false; };
  }, [slug]);
  if (!componentMap) {
    return <article data-uifn-component-loading={slug}>Loading {slug}…</article>;
  }
  const demo = getCatalogComponentDemo(slug);
  if (slug === "form") {
    return <ReactFormFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "field") {
    return <ReactFieldFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "breadcrumb") {
    return <ReactBreadcrumbFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "card") {
    return <ReactCardFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "skeleton") {
    return <ReactSkeletonFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "fieldset") {
    return <ReactFieldsetFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "color-picker") {
    return <ReactColorPickerFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "date-picker") {
    return <ReactDatePickerFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "dialog") {
    return <ReactDialogFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "drawer") {
    return <ReactDrawerFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "hover-card") {
    return <ReactHoverCardFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "input-group") {
    return <ReactInputGroupFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "splitter") {
    return <ReactSplitterFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "steps") {
    return <ReactStepsFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "navigation-menu") {
    return <ReactNavigationMenuFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "pagination") {
    return <ReactPaginationFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "tree-view") {
    return <ReactTreeViewFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "tags-input") {
    return <ReactTagsInputFixture route={route} componentMap={componentMap} />;
  }
  if (slug === "table") {
    return <ReactTableFixture route={route} componentMap={componentMap} />;
  }
  const Root = componentMap[demo.root.exportName];
  if (!Root) {
    return <Unsupported family="component" slug={slug} reason={`Missing React export ${demo.root.exportName}`} />;
  }
  const children = catalogDemoChildren(demo, demo.root.id)
    .flatMap((part) => renderCatalogDemoPartInstances(slug, demo, part, componentMap));
  return React.createElement(
    Root,
    catalogDemoRootPropsForRoute(slug, route),
    demo.root.voidElement ? undefined : (children.length ? children : catalogDemoRootText(slug)),
  );
}

function ReactBreadcrumbFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const Root = componentMap.BreadcrumbRoot;
  const List = componentMap.BreadcrumbList;
  const Item = componentMap.BreadcrumbItem;
  const Link = componentMap.BreadcrumbLink;
  const Page = componentMap.BreadcrumbPage;
  const Separator = componentMap.BreadcrumbSeparator;
  const Ellipsis = componentMap.BreadcrumbEllipsis;
  if (!Root || !List || !Item || !Link || !Page || !Separator || !Ellipsis) {
    return <Unsupported family="component" slug="breadcrumb" reason="Incomplete React Breadcrumb exports" />;
  }
  return (
    <Root {...catalogDemoRootPropsForRoute("breadcrumb", route)}>
      <List>
        <Item value="workspace"><Link value="workspace" href="#workspace">Workspace</Link></Item>
        <Separator value="workspace-projects" />
        <Item value="collapsed"><Ellipsis /></Item>
        <Separator value="collapsed-projects" />
        <Item value="projects"><Link value="projects" href="#projects">Projects</Link></Item>
        <Separator value="projects-settings" />
        <Item value="settings"><Page>Settings</Page></Item>
      </List>
    </Root>
  );
}

function ReactTableFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const [query, setQuery] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const pageSize = 4;
  const filteredRows = catalogDeploymentRows.filter((row) => (
    `${row.environment} ${row.release} ${row.status} ${row.region}`.toLowerCase().includes(query.toLowerCase())
  ));
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(pageIndex, pageCount - 1);
  const rows = filteredRows.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const Root = componentMap.TableRoot;
  const Table = componentMap.TableTable;
  const Caption = componentMap.TableCaption;
  const Header = componentMap.TableHeader;
  const Body = componentMap.TableBody;
  const Footer = componentMap.TableFooter;
  const Row = componentMap.TableRow;
  const Head = componentMap.TableHead;
  const Cell = componentMap.TableCell;
  if (!Root || !Table || !Caption || !Header || !Body || !Footer || !Row || !Head || !Cell) {
    return <Unsupported family="component" slug="table" reason="Incomplete React Table exports" />;
  }
  return (
    <div className="catalog-data-table-demo">
      <div className="catalog-data-table-heading">
        <div><strong>Deployments</strong><span>Monitor release health across environments.</span></div>
        <label className="catalog-table-search">
          <span className="sr-only">Filter deployments</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            value={query}
            onChange={(event) => { setQuery(event.currentTarget.value); setPageIndex(0); }}
            placeholder="Filter deployments…"
          />
        </label>
      </div>
      <Root {...catalogDemoRootPropsForRoute("table", route)}>
        <Table>
          <Caption>Deployment environments and their current release health.</Caption>
          <Header>
            <Row value="header">
              <Head value="select"><input type="checkbox" aria-label="Select visible deployments" checked={allVisibleSelected} onChange={(event) => {
                const next = new Set(selected);
                for (const row of rows) event.currentTarget.checked ? next.add(row.id) : next.delete(row.id);
                setSelected(next);
              }} /></Head>
              <Head value="environment">Environment</Head>
              <Head value="release">Release</Head>
              <Head value="status">Status</Head>
              <Head value="updated">Updated</Head>
              <Head value="action"><span className="sr-only">Actions</span></Head>
            </Row>
          </Header>
          <Body>
            {rows.length ? rows.map((row) => (
              <Row key={row.id} value={row.id}>
                <Cell value={`${row.id}-select`}><input type="checkbox" aria-label={`Select ${row.environment}`} checked={selected.has(row.id)} onChange={(event) => {
                  const next = new Set(selected);
                  event.currentTarget.checked ? next.add(row.id) : next.delete(row.id);
                  setSelected(next);
                }} /></Cell>
                <Cell value={`${row.id}-environment`}><strong>{row.environment}</strong><span className="catalog-table-region">{row.region}</span></Cell>
                <Cell value={`${row.id}-release`}><code>{row.release}</code></Cell>
                <Cell value={`${row.id}-status`}><span className="catalog-status-badge" data-status={row.status.toLowerCase()}><i />{row.status}</span></Cell>
                <Cell value={`${row.id}-updated`}>{row.updated}</Cell>
                <Cell value={`${row.id}-action`}><a className="catalog-table-action" href={`#deployment-${row.id}`}>Inspect</a></Cell>
              </Row>
            )) : (
              <Row value="empty"><Cell value="empty" colSpan={6}><div className="catalog-table-empty"><strong>No deployments found</strong><span>Try another environment, release, status, or region.</span></div></Cell></Row>
            )}
          </Body>
          <Footer>
            <Row value="summary">
              <Cell value="summary" colSpan={6}>
                <div className="catalog-table-pagination">
                  <span>{selected.size} selected · {filteredRows.length} deployments</span>
                  <div>
                    <button type="button" disabled={safePage === 0} onClick={() => setPageIndex((value) => Math.max(0, value - 1))}>Previous</button>
                    <span>Page {safePage + 1} of {pageCount}</span>
                    <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPageIndex((value) => Math.min(pageCount - 1, value + 1))}>Next</button>
                  </div>
                </div>
              </Cell>
            </Row>
          </Footer>
        </Table>
      </Root>
    </div>
  );
}

function ReactCardFixture({ route, componentMap }: { route: WorkbenchRoute; componentMap: ComponentMap }) {
  const Root = componentMap.CardRoot;
  const Header = componentMap.CardHeader;
  const Title = componentMap.CardTitle;
  const Description = componentMap.CardDescription;
  const Action = componentMap.CardAction;
  const Content = componentMap.CardContent;
  const Footer = componentMap.CardFooter;
  if (!Root || !Header || !Title || !Description || !Action || !Content || !Footer) {
    return <Unsupported family="component" slug="card" reason="Incomplete React Card exports" />;
  }
  return (
    <Root {...catalogDemoRootPropsForRoute("card", route)}>
      <Header>
        <Title><span className="catalog-card-icon" aria-hidden="true"><span /></span><span>Release health</span></Title>
        <Description>Production deployment status for Acme Cloud.</Description>
        <Action><Button variant="ghost" size="sm"><Button.Label>View releases</Button.Label><Button.Icon aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></Button.Icon></Button></Action>
      </Header>
      <Content>
        <div className="catalog-card-status"><i /><div><strong>All systems operational</strong><span>12 checks passed across 3 regions</span></div></div>
        <dl className="catalog-card-metrics">
          <div><dt>Version</dt><dd>v2.9.0</dd></div>
          <div><dt>Latency</dt><dd>84 ms</dd></div>
          <div><dt>Errors</dt><dd>0.02%</dd></div>
        </dl>
      </Content>
      <Footer><div className="catalog-avatar-stack" aria-label="Release owners"><span>AM</span><span>SK</span><span>TR</span></div><span>Deployed 8 minutes ago by Alex Morgan</span></Footer>
    </Root>
  );
}

function ReactPaginationFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const Root = componentMap.PaginationRoot;
  const List = componentMap.PaginationList;
  const Item = componentMap.PaginationItem;
  const PageTrigger = componentMap.PaginationPageTrigger;
  const Previous = componentMap.PaginationPrevious;
  const Next = componentMap.PaginationNext;
  const Ellipsis = componentMap.PaginationEllipsis;
  if (!Root || !List || !Item || !PageTrigger || !Previous || !Next || !Ellipsis) {
    return <Unsupported family="component" slug="pagination" reason="Incomplete React Pagination exports" />;
  }
  return (
    <Root {...catalogDemoRootPropsForRoute("pagination", route)}>
      <List>
        <li><Previous type="button">Previous</Previous></li>
        <Item value={1}><PageTrigger type="button" value={1}>1</PageTrigger></Item>
        <Item value={2}><PageTrigger type="button" value={2}>2</PageTrigger></Item>
        <Item value={3}><PageTrigger type="button" value={3}>3</PageTrigger></Item>
        <Ellipsis value="start">…</Ellipsis>
        <Item value={10}><PageTrigger type="button" value={10}>10</PageTrigger></Item>
        <li><Next type="button">Next</Next></li>
      </List>
    </Root>
  );
}

function ReactSkeletonFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const Root = componentMap.SkeletonRoot;
  if (!Root) return <Unsupported family="component" slug="skeleton" reason="Missing React Skeleton export" />;
  return (
    <Root {...catalogDemoRootPropsForRoute("skeleton", route)} className="catalog-production-skeleton">
      <span className="catalog-production-skeleton-avatar" />
      <span className="catalog-production-skeleton-copy"><i /><i /><i /></span>
    </Root>
  );
}

function ReactInputGroupFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const Root = componentMap.InputGroupRoot;
  const Addon = componentMap.InputGroupAddon;
  const Text = componentMap.InputGroupText;
  const Control = componentMap.InputGroupControl;
  const Input = componentMap.InputGroupInput;
  const Textarea = componentMap.InputGroupTextarea;
  const ButtonPart = componentMap.InputGroupButton;
  if (!Root || !Addon || !Text || !Control || !Input || !Textarea || !ButtonPart) {
    return <Unsupported family="component" slug="input-group" reason="Incomplete React InputGroup exports" />;
  }
  return (
    <Root {...catalogDemoRootPropsForRoute("input-group", route)}>
      <Addon value="protocol"><Text value="protocol">https://</Text></Addon>
      <Control>
        <Input aria-label="Project domain" placeholder="project-name" />
        <Textarea hidden aria-label="Project domain notes" />
      </Control>
      <Addon value="copy"><ButtonPart value="copy" type="button">Copy</ButtonPart></Addon>
    </Root>
  );
}

function ReactDialogFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const longContent = route.fixtureId === "long-content";
  const Root = componentMap.DialogRoot;
  const Trigger = componentMap.DialogTrigger;
  const Portal = componentMap.DialogPortal;
  const Backdrop = componentMap.DialogBackdrop;
  const Positioner = componentMap.DialogPositioner;
  const Content = componentMap.DialogContent;
  const Title = componentMap.DialogTitle;
  const Description = componentMap.DialogDescription;
  const Close = componentMap.DialogClose;
  if (!Root || !Trigger || !Portal || !Backdrop || !Positioner || !Content || !Title || !Description || !Close) {
    return <Unsupported family="component" slug="dialog" reason="Incomplete React Dialog exports" />;
  }
  return (
    <Root {...catalogDemoRootPropsForRoute("dialog", route)}>
      <Trigger type="button">Edit profile</Trigger>
      <Portal>
        <Backdrop />
        <Positioner>
          <Content className={longContent ? "catalog-dialog-content catalog-dialog-content--long" : "catalog-dialog-content"}>
            <Title>Edit profile</Title>
            <Description>Update the details teammates see across your workspace.</Description>
            {longContent ? (
              <div className="catalog-dialog-long-copy">
                <section><h3>Profile visibility</h3><p>Your name and photo are visible to every member of this workspace and in shared activity.</p></section>
                <section><h3>Contact details</h3><p>Your work email is only shown to workspace owners and administrators who manage access.</p></section>
                <section><h3>Notifications</h3><p>Security and billing notices continue to use the verified account email even when this profile changes.</p></section>
              </div>
            ) : null}
            <form className="catalog-dialog-form" onSubmit={(event) => event.preventDefault()}>
              <label>
                Display name
                <input name="displayName" defaultValue="Alex Morgan" autoComplete="name" />
              </label>
              <label>
                Work email
                <input name="email" type="email" defaultValue="alex@company.com" autoComplete="email" />
              </label>
              <div className="catalog-dialog-actions">
                <button type="button" className="catalog-dialog-cancel">Cancel</button>
                <button type="submit" className="catalog-primary-action">Save changes</button>
              </div>
            </form>
            {route.fixtureId === "nested-overlay" ? (
              <Root
                defaultOpen
                environment={{ scopeId: "uifn-catalog-dialog-nested", hydrationSeed: "dialog-nested" }}
              >
                <Trigger type="button">Review sharing</Trigger>
                <Portal>
                  <Backdrop />
                  <Positioner>
                    <Content className="catalog-dialog-content catalog-dialog-content--nested">
                      <Title>Share profile changes?</Title>
                      <Description>These updates will be visible to everyone in Acme Cloud.</Description>
                      <div className="catalog-dialog-actions">
                        <Close type="button" className="catalog-dialog-cancel catalog-dialog-inline-close">Keep editing</Close>
                        <button type="button" className="catalog-primary-action">Share changes</button>
                      </div>
                    </Content>
                  </Positioner>
                </Portal>
              </Root>
            ) : null}
            <Close type="button" aria-label="Close dialog" className="catalog-overlay-close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></Close>
          </Content>
        </Positioner>
      </Portal>
    </Root>
  );
}

function ReactDrawerFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const Root = componentMap.DrawerRoot;
  const Trigger = componentMap.DrawerTrigger;
  const Portal = componentMap.DrawerPortal;
  const Backdrop = componentMap.DrawerBackdrop;
  const Positioner = componentMap.DrawerPositioner;
  const Content = componentMap.DrawerContent;
  const Handle = componentMap.DrawerHandle;
  const Title = componentMap.DrawerTitle;
  const Description = componentMap.DrawerDescription;
  const Close = componentMap.DrawerClose;
  if (!Root || !Trigger || !Portal || !Backdrop || !Positioner || !Content || !Title || !Description || !Close) {
    return <Unsupported family="component" slug="drawer" reason="Incomplete React Drawer exports" />;
  }
  return (
    <Root {...catalogDemoRootPropsForRoute("drawer", route)}>
      <Trigger type="button">Open filters</Trigger>
      <Portal>
        <Backdrop />
        <Positioner>
          <Content>
            {Handle ? <Handle aria-hidden="true" /> : null}
            <Title>Filter activity</Title>
            <Description>Narrow the workspace feed without leaving the page.</Description>
            <form className="catalog-drawer-form" onSubmit={(event) => event.preventDefault()}>
              <fieldset>
                <legend>Activity type</legend>
                <label><input type="checkbox" defaultChecked /> Deployments</label>
                <label><input type="checkbox" defaultChecked /> Pull requests</label>
                <label><input type="checkbox" /> Team updates</label>
              </fieldset>
              <label>
                Member
                <select defaultValue="any"><option value="any">Anyone</option><option>Alex Morgan</option><option>Sam Rivera</option></select>
              </label>
              <button type="submit" className="catalog-primary-action">Apply filters</button>
            </form>
            <Close type="button" aria-label="Close filters" className="catalog-overlay-close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></Close>
          </Content>
        </Positioner>
      </Portal>
    </Root>
  );
}

function ReactHoverCardFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const Root = componentMap.HoverCardRoot;
  const Trigger = componentMap.HoverCardTrigger;
  const Positioner = componentMap.HoverCardPositioner;
  const Content = componentMap.HoverCardContent;
  const Arrow = componentMap.HoverCardArrow;
  if (!Root || !Trigger || !Positioner || !Content) {
    return <Unsupported family="component" slug="hover-card" reason="Incomplete React HoverCard exports" />;
  }
  return (
    <Root {...catalogDemoRootPropsForRoute("hover-card", route)}>
      <Trigger href="#preview">@alex</Trigger>
      <Positioner>
        <Content>
          {Arrow ? <Arrow /> : null}
          <div className="catalog-profile-card">
            <span className="catalog-profile-avatar" aria-hidden="true">AM</span>
            <div><strong>Alex Morgan</strong><span>Frontend infrastructure</span></div>
            <p>Building accessible platform primitives for the design systems team.</p>
            <dl><div><dt>Projects</dt><dd>42</dd></div><div><dt>Following</dt><dd>128</dd></div></dl>
          </div>
        </Content>
      </Positioner>
    </Root>
  );
}

function july2026CalendarRows(): readonly (readonly { key: string; day: number }[])[] {
  return Array.from({ length: 6 }, (_, row) => (
    Array.from({ length: 7 }, (_, column) => {
      const value = new Date(Date.UTC(2026, 5, 28 + row * 7 + column));
      return {
        key: value.toISOString().slice(0, 10),
        day: value.getUTCDate(),
      };
    })
  ));
}

function ReactColorPickerFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const Root = componentMap.ColorPickerRoot;
  const Label = componentMap.ColorPickerLabel;
  const Control = componentMap.ColorPickerControl;
  const Trigger = componentMap.ColorPickerTrigger;
  const Positioner = componentMap.ColorPickerPositioner;
  const Content = componentMap.ColorPickerContent;
  const Area = componentMap.ColorPickerArea;
  const AreaThumb = componentMap.ColorPickerAreaThumb;
  const ChannelSlider = componentMap.ColorPickerChannelSlider;
  const ChannelInput = componentMap.ColorPickerChannelInput;
  const Swatch = componentMap.ColorPickerSwatch;
  const HiddenInput = componentMap.ColorPickerHiddenInput;
  if (!Root || !Label || !Control || !Trigger || !Positioner || !Content || !Area || !AreaThumb || !ChannelSlider || !ChannelInput || !Swatch || !HiddenInput) {
    return <Unsupported family="component" slug="color-picker" reason="Incomplete React ColorPicker exports" />;
  }
  const channels = [
    { value: "r", label: "Red" },
    { value: "g", label: "Green" },
    { value: "b", label: "Blue" },
    { value: "alpha", label: "Alpha" },
  ];
  return (
    <Root {...catalogDemoRootPropsForRoute("color-picker", route)}>
      <Label>Brand color</Label>
      <Control>
        <Trigger type="button">
          <Swatch aria-hidden="true" />
          <span>Custom color</span>
        </Trigger>
      </Control>
      <Positioner>
        <Content>
          <Area>
            <AreaThumb tabIndex={0} />
          </Area>
          <div className="catalog-color-picker-channels">
            {channels.map((channel) => (
              <label key={channel.value}>
                <span>{channel.label}</span>
                <ChannelSlider value={channel.value} tabIndex={0} />
                <ChannelInput value={channel.value} inputMode="decimal" />
              </label>
            ))}
          </div>
        </Content>
      </Positioner>
      <HiddenInput />
    </Root>
  );
}

function ReactDatePickerFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const Root = componentMap.DatePickerRoot;
  const Label = componentMap.DatePickerLabel;
  const Input = componentMap.DatePickerInput;
  const Segment = componentMap.DatePickerSegment;
  const Trigger = componentMap.DatePickerTrigger;
  const Positioner = componentMap.DatePickerPositioner;
  const Content = componentMap.DatePickerContent;
  const Header = componentMap.DatePickerHeader;
  const Previous = componentMap.DatePickerPrevious;
  const Next = componentMap.DatePickerNext;
  const Grid = componentMap.DatePickerGrid;
  const GridLabel = componentMap.DatePickerGridLabel;
  const Cell = componentMap.DatePickerCell;
  const CellTrigger = componentMap.DatePickerCellTrigger;
  const HiddenInput = componentMap.DatePickerHiddenInput;
  if (!Root || !Label || !Input || !Segment || !Trigger || !Positioner || !Content || !Header || !Previous || !Next || !Grid || !GridLabel || !Cell || !CellTrigger || !HiddenInput) {
    return <Unsupported family="component" slug="date-picker" reason="Incomplete React DatePicker exports" />;
  }
  const rows = july2026CalendarRows();
  return (
    <Root {...catalogDemoRootPropsForRoute("date-picker", route)}>
      <Label>Due date</Label>
      <div className="catalog-date-picker-control">
        <Input>
          <Segment value="month">07</Segment>
          <span aria-hidden="true">/</span>
          <Segment value="day">22</Segment>
          <span aria-hidden="true">/</span>
          <Segment value="year">2026</Segment>
        </Input>
        <Trigger type="button" aria-label="Open calendar">Calendar</Trigger>
      </div>
      <Positioner>
        <Content>
          <Header>
            <Previous type="button" aria-label="Previous month">‹</Previous>
            <strong>July 2026</strong>
            <Next type="button" aria-label="Next month">›</Next>
          </Header>
          <Grid>
            <GridLabel>July 2026</GridLabel>
            <thead>
              <tr>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <th key={day} scope="col">{day}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row[0].key}>
                  {row.map((date) => (
                    <Cell key={date.key} value={date.key}>
                      <CellTrigger type="button" value={date.key}>{date.day}</CellTrigger>
                    </Cell>
                  ))}
                </tr>
              ))}
            </tbody>
          </Grid>
        </Content>
      </Positioner>
      <HiddenInput />
    </Root>
  );
}

function ReactSplitterFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const Root = componentMap.SplitterRoot;
  const Panel = componentMap.SplitterPanel;
  const ResizeTrigger = componentMap.SplitterResizeTrigger;
  const ResizeHandle = componentMap.SplitterResizeHandle;
  if (!Root || !Panel || !ResizeTrigger || !ResizeHandle) {
    return <Unsupported family="component" slug="splitter" reason="Incomplete React Splitter exports" />;
  }
  return (
    <Root {...catalogDemoRootPropsForRoute("splitter", route)} aria-label="Workspace layout">
      <Panel value={0}>Navigation</Panel>
      <ResizeTrigger value={0} />
      <ResizeHandle value={0} />
      <Panel value={1}>Editor</Panel>
    </Root>
  );
}

function ReactStepsFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const Root = componentMap.StepsRoot;
  const List = componentMap.StepsList;
  const Item = componentMap.StepsItem;
  const Trigger = componentMap.StepsTrigger;
  const Indicator = componentMap.StepsIndicator;
  const Separator = componentMap.StepsSeparator;
  const Content = componentMap.StepsContent;
  const Completed = componentMap.StepsCompleted;
  if (!Root || !List || !Item || !Trigger || !Indicator || !Separator || !Content || !Completed) {
    return <Unsupported family="component" slug="steps" reason="Incomplete React Steps exports" />;
  }
  const labels = ["Account", "Profile", "Review"];
  const descriptions = [
    "Create your account.",
    "Complete your profile.",
    "Review and submit.",
  ];
  return (
    <Root {...catalogDemoRootPropsForRoute("steps", route)} aria-label="Account setup">
      <List>
        {labels.map((label, index) => (
          <Item key={label} value={index}>
            <Indicator value={index}>{index + 1}</Indicator>
            <Completed value={index}>✓</Completed>
            <Trigger type="button" value={index}>{label}</Trigger>
            <Separator value={index} />
          </Item>
        ))}
      </List>
      {descriptions.map((description, index) => (
        <Content key={description} value={index}>{description}</Content>
      ))}
    </Root>
  );
}

function ReactTreeViewFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const Root = componentMap.TreeViewRoot;
  const Label = componentMap.TreeViewLabel;
  const Tree = componentMap.TreeViewTree;
  const Item = componentMap.TreeViewItem;
  const ItemTrigger = componentMap.TreeViewItemTrigger;
  const ItemText = componentMap.TreeViewItemText;
  const Branch = componentMap.TreeViewBranch;
  const Indicator = componentMap.TreeViewIndicator;
  if (!Root || !Label || !Tree || !Item || !ItemTrigger || !ItemText || !Branch || !Indicator) {
    return <Unsupported family="component" slug="tree-view" reason="Incomplete React TreeView exports" />;
  }
  return (
    <Root {...catalogDemoRootPropsForRoute("tree-view", route)}>
      <Label>Project files</Label>
      <Tree>
        <Item value="item-1">
          <ItemTrigger type="button" value="item-1" aria-label="Toggle Workspace">›</ItemTrigger>
          <ItemText value="item-1">Workspace</ItemText>
          <Branch value="item-1">
            <Item value="item-2">
              <ItemTrigger type="button" value="item-2" aria-label="Projects">›</ItemTrigger>
              <ItemText value="item-2">Projects</ItemText>
              <Branch value="item-2" />
              <Indicator value="item-2">⌄</Indicator>
            </Item>
          </Branch>
          <Indicator value="item-1">⌄</Indicator>
        </Item>
      </Tree>
    </Root>
  );
}

function ReactFormFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const Root = componentMap.FormRoot;
  const ErrorSummary = componentMap.FormErrorSummary;
  const Actions = componentMap.FormActions;
  if (!Root || !ErrorSummary || !Actions) {
    return <Unsupported family="component" slug="form" reason="Incomplete React Form exports" />;
  }
  return (
    <Root {...catalogDemoRootPropsForRoute("form", route)}>
      <div className="catalog-form-field">
        <label htmlFor="react-workspace-name">Workspace name</label>
        <input
          id="react-workspace-name"
          name="workspaceName"
          defaultValue="Acme Design"
          autoComplete="organization"
          required
        />
        <span>Used in navigation, invitations, and shared links.</span>
      </div>
      <ErrorSummary />
      <Actions>
        <button type="button" className="catalog-secondary-action">Cancel</button>
        <button type="submit" className="catalog-primary-action">Save workspace</button>
      </Actions>
    </Root>
  );
}

function ReactFieldFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const Root = componentMap.FieldRoot;
  const Label = componentMap.FieldLabel;
  const Control = componentMap.FieldControl;
  const Description = componentMap.FieldDescription;
  const ErrorPart = componentMap.FieldError;
  const RequiredIndicator = componentMap.FieldRequiredIndicator;
  if (!Root || !Label || !Control || !Description || !ErrorPart || !RequiredIndicator) {
    return <Unsupported family="component" slug="field" reason="Incomplete React Field exports" />;
  }
  return (
    <Root {...catalogDemoRootPropsForRoute("field", route)} required>
      <Label htmlFor="react-work-email">
        Work email <RequiredIndicator>*</RequiredIndicator>
      </Label>
      <Control>
        <input
          id="react-work-email"
          className="catalog-field-input"
          name="email"
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          aria-describedby="react-work-email-description"
          required
        />
      </Control>
      <Description id="react-work-email-description">
        We will only use this for account notifications.
      </Description>
      <ErrorPart />
    </Root>
  );
}

function ReactFieldsetFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const Root = componentMap.FieldsetRoot;
  const Legend = componentMap.FieldsetLegend;
  const Content = componentMap.FieldsetContent;
  const Description = componentMap.FieldsetDescription;
  const ErrorPart = componentMap.FieldsetError;
  if (!Root || !Legend || !Content || !Description || !ErrorPart) {
    return <Unsupported family="component" slug="fieldset" reason="Incomplete React Fieldset exports" />;
  }
  return (
    <Root {...catalogDemoRootPropsForRoute("fieldset", route)}>
      <Legend>Workspace notifications</Legend>
      <Description>Choose which updates your team should receive.</Description>
      <Content>
        <label className="catalog-fieldset-option">
          <input type="checkbox" defaultChecked /> Product updates
        </label>
        <label className="catalog-fieldset-option">
          <input type="checkbox" /> Security alerts
        </label>
      </Content>
      <ErrorPart />
    </Root>
  );
}

function ReactNavigationMenuFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const Root = componentMap.NavigationMenuRoot;
  const List = componentMap.NavigationMenuList;
  const Item = componentMap.NavigationMenuItem;
  const Trigger = componentMap.NavigationMenuTrigger;
  const Content = componentMap.NavigationMenuContent;
  const Link = componentMap.NavigationMenuLink;
  const Viewport = componentMap.NavigationMenuViewport;
  const Indicator = componentMap.NavigationMenuIndicator;
  if (!Root || !List || !Item || !Trigger || !Content || !Link || !Viewport || !Indicator) {
    return <Unsupported family="component" slug="navigation-menu" reason="Incomplete React NavigationMenu exports" />;
  }
  const entries = [
    { value: "item-1", trigger: "Products", link: "Product overview", description: "Explore primitives, recipes, and production-ready components.", href: "#products" },
    { value: "item-2", trigger: "Resources", link: "Documentation", description: "Learn the APIs, accessibility model, and framework adapters.", href: "#documentation" },
    { value: "item-3", trigger: "Company", link: "About uifn", description: "Meet the team building the cross-framework UI foundation.", href: "#company" },
  ];
  return (
    <Root {...catalogDemoRootPropsForRoute("navigation-menu", route)}>
      <List>
        {entries.map((entry) => (
          <Item key={entry.value} value={entry.value}>
            <Trigger type="button" value={entry.value}>{entry.trigger}</Trigger>
            <Content value={entry.value}>
              <Link className="catalog-navigation-card" value={entry.value} href={entry.href}>
                <strong>{entry.link}</strong>
                <span>{entry.description}</span>
              </Link>
            </Content>
          </Item>
        ))}
      </List>
      <Viewport />
      <Indicator />
    </Root>
  );
}

function ReactTagsInputFixture({
  route,
  componentMap,
}: {
  route: WorkbenchRoute;
  componentMap: ComponentMap;
}) {
  const [values, setValues] = useState(["item-1", "item-2"]);
  const Root = componentMap.TagsInputRoot;
  const Label = componentMap.TagsInputLabel;
  const Control = componentMap.TagsInputControl;
  const Item = componentMap.TagsInputItem;
  const ItemText = componentMap.TagsInputItemText;
  const ItemDelete = componentMap.TagsInputItemDelete;
  const Input = componentMap.TagsInputInput;
  const Clear = componentMap.TagsInputClear;
  const HiddenInput = componentMap.TagsInputHiddenInput;
  const ErrorPart = componentMap.TagsInputError;
  if (!Root || !Label || !Control || !Item || !ItemText || !ItemDelete || !Input || !Clear || !HiddenInput || !ErrorPart) {
    return <Unsupported family="component" slug="tags-input" reason="Incomplete React TagsInput exports" />;
  }
  return (
    <Root
      {...catalogDemoRootPropsForRoute("tags-input", route)}
      value={values}
      onValueChange={(next: unknown) => setValues(Array.isArray(next) ? next.map(String) : [])}
    >
      <Label>Release tags</Label>
      <Control>
        {values.map((value) => (
          <Item key={value} value={value}>
            <ItemText value={value}>{value === "item-1" ? "Frontend" : value === "item-2" ? "Stable" : value}</ItemText>
            <ItemDelete value={value} aria-label={`Remove ${value}`}><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></ItemDelete>
          </Item>
        ))}
        <Input aria-label="Add tag" placeholder="Add a tag" />
      </Control>
      <Clear>Clear all tags</Clear>
      {values.map((value) => <HiddenInput key={value} value={value} />)}
      <ErrorPart />
    </Root>
  );
}

function renderCatalogDemoPartInstances(
  slug: ComponentSlug,
  demo: CatalogComponentDemo,
  part: CatalogDemoPart,
  componentMap: ComponentMap,
  inheritedIndex = 0,
): React.ReactNode[] {
  return catalogDemoPartInstances(part).map((ownIndex) => {
    const instanceIndex = part.repeat > 1 ? ownIndex : inheritedIndex;
    return (
      <React.Fragment key={`${part.id}-${instanceIndex}`}>
        {renderCatalogDemoPart(slug, demo, part, componentMap, instanceIndex)}
      </React.Fragment>
    );
  });
}

function renderCatalogDemoPart(
  slug: ComponentSlug,
  demo: CatalogComponentDemo,
  part: CatalogDemoPart,
  componentMap: ComponentMap,
  instanceIndex: number,
): React.ReactNode {
  const Part = componentMap[part.exportName];
  if (!Part) return <span data-uifn-demo-missing={part.exportName}>Missing {part.exportName}</span>;
  const descendants = catalogDemoChildren(demo, part.id);
  const regularDescendants = descendants.filter((child) => child.element !== "td");
  const cellDescendants = descendants.filter((child) => child.element === "td");
  const children: React.ReactNode[] = [];
  const text = catalogDemoPartText(slug, part, instanceIndex);
  if (text) children.push(text);
  children.push(...regularDescendants.flatMap((child) => (
    renderCatalogDemoPartInstances(slug, demo, child, componentMap, instanceIndex)
  )));
  if (cellDescendants.length) {
    children.push(
      <tbody key={`${part.id}-body`}>
        <tr>{cellDescendants.flatMap((child) => (
          renderCatalogDemoPartInstances(slug, demo, child, componentMap, instanceIndex)
        ))}</tr>
      </tbody>,
    );
  }
  if (
    !part.voidElement &&
    children.length === 0 &&
    catalogDemoShouldAddFallbackText(slug, part)
  ) {
    children.push(`${part.id} example`);
  }
  return React.createElement(
    Part,
    {
      ...catalogDemoPartProps(slug, part, instanceIndex),
      "data-uifn-catalog-anatomy": part.id,
    },
    part.voidElement || children.length === 0 ? undefined : children,
  );
}

function InteractiveButtonFixture({ props, fixtureCase }: { props: Record<string, unknown>; fixtureCase: string }) {
  const iconOnly = fixtureCase.startsWith("icon-");
  const [toastOpen, setToastOpen] = useState(false);
  const [toastComponents, setToastComponents] = useState<ComponentMap | null>(null);
  useEffect(() => {
    let active = true;
    void reactComponentLoaders.toast?.().then((loaded) => {
      if (active) setToastComponents(loaded as unknown as ComponentMap);
    });
    return () => { active = false; };
  }, []);
  const ToastViewport = toastComponents?.ToastViewport ?? toastComponents?.Toast;
  const ToastRoot = toastComponents?.ToastRoot;
  const ToastTitle = toastComponents?.ToastTitle;
  const ToastDescription = toastComponents?.ToastDescription;
  const ToastAction = toastComponents?.ToastAction;
  const ToastClose = toastComponents?.ToastClose;
  const toastReady = Boolean(
    ToastViewport && ToastRoot && ToastTitle && ToastDescription && ToastAction && ToastClose,
  );
  const ReadyToastViewport = ToastViewport as React.ComponentType<Record<string, unknown>>;
  const ReadyToastRoot = ToastRoot as React.ComponentType<Record<string, unknown>>;
  const ReadyToastTitle = ToastTitle as React.ComponentType<Record<string, unknown>>;
  const ReadyToastDescription = ToastDescription as React.ComponentType<Record<string, unknown>>;
  const ReadyToastAction = ToastAction as React.ComponentType<Record<string, unknown>>;
  const ReadyToastClose = ToastClose as React.ComponentType<Record<string, unknown>>;
  return (
    <>
      <div className="qa-edge-box" data-case={fixtureCase}>
        <div className="catalog-button-demo">
          <Button {...props} onClick={() => setToastOpen(true)}>
            <Button.Icon aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false"><path d="m5 12 4 4L19 6" /></svg>
            </Button.Icon>
            {!iconOnly ? <Button.Label>Save changes</Button.Label> : null}
            <Button.Spinner aria-hidden="true">Saving</Button.Spinner>
          </Button>
          <span>{catalogDemoFixtureDescription("button", fixtureCase)}</span>
        </div>
      </div>
      {toastOpen && toastReady ? (
        <ReadyToastViewport
          className="catalog-action-toast"
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
          <ReadyToastRoot value="save-confirmation">
            <ReadyToastTitle value="save-confirmation">Changes published</ReadyToastTitle>
            <ReadyToastDescription value="save-confirmation">Your changes are now live.</ReadyToastDescription>
            <ReadyToastAction value="save-confirmation">Undo</ReadyToastAction>
            <ReadyToastClose value="save-confirmation">Close</ReadyToastClose>
          </ReadyToastRoot>
        </ReadyToastViewport>
      ) : null}
    </>
  );
}

function PatternFixture({ slug, route }: { slug: string; route: WorkbenchRoute }) {
  const pattern = getPatternBySlug(slug);
  if (!pattern) return <Unsupported family="pattern" slug={slug} reason="Unknown pattern" />;
  const render = patternMap[pattern.name];
  if (!render) return <Unsupported family="pattern" slug={slug} reason={`Missing pattern export ${pattern.name}`} />;
  const status = getStatusFromRoute(route);
  const model = render(patternProps(pattern.name as PatternName, status));
  return <ModelCard family="pattern" slug={slug} name={pattern.name} status={status} model={model} />;
}

function SfFixture({ slug, route }: { slug: string; route: WorkbenchRoute }) {
  const panel = getSfPanelBySlug(slug);
  const [model, setModel] = useState<CatalogModel | null>(null);
  const status = getStatusFromRoute(route);
  const sfClients = useMemo(() => sf.createMockSuperfunctionClients(), [slug, status]);

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!panel) return;
      const render = sfMap[panel.name];
      if (!render) return;
      const clientProps = {
        status,
        authClient: sfClients.authClient,
        plugClient: sfClients.plugClient,
        fileClient: sfClients.fileClient,
        billClient: sfClients.billClient,
      };
      const nextModel = await render(clientProps);
      const callSummary = sfClients.getCallSummary();
      if (alive) setModel({
        ...nextModel,
        clientCallSummary: callSummary,
        clientCallCount: Object.values(callSummary).reduce((sum, value) => sum + Number(value), 0),
      });
    }
    void load();
    return () => { alive = false; };
  }, [panel, status, sfClients]);

  if (!panel) return <Unsupported family="sf" slug={slug} reason="Unknown SF panel" />;
  if (!model) return <article data-uifn-sf={slug} data-status="loading">Loading {panel.name}</article>;
  return <ModelCard family="sf" slug={slug} name={panel.name} status={status} model={model} />;
}

function ModelCard({
  family,
  slug,
  name,
  status,
  model,
}: {
  family: "pattern" | "sf";
  slug: string;
  name: string;
  status: string;
  model: CatalogModel;
}) {
  return (
    <div
      dangerouslySetInnerHTML={{
        __html: patternModelHtml({
          family,
          slug,
          name,
          status: status as never,
          itemCount: model.state.itemCount,
          callbacks: model.callbacks,
          data: model.data,
          backendImports: model.backendImports,
          metadata: family === "sf" ? {
            superfunction: model.superfunction,
            controlledCounterpart: model.controlledCounterpart,
            usesInjectedClient: String(model.usesInjectedClient),
            clientType: "fake",
            clientCallCount: model.clientCallCount,
          } : undefined,
        }),
      }}
    />
  );
}

function Unsupported({ family, slug, reason }: { family: string; slug: string; reason: string }) {
  return (
    <article className="fixture-card" data-uifn-unsupported="true" data-family={family} data-slug={slug}>
      <h2>{slug}</h2>
      <p>{reason}</p>
    </article>
  );
}

function Gallery({ route, basePath, navigate }: { route: WorkbenchRoute; basePath: string; navigate: (path: string) => void }) {
  if (route.path === "/" || route.path === "/components") {
    return <div dangerouslySetInnerHTML={{ __html: catalogComponentGalleryHtml(basePath, "react") }} />;
  }
  if (route.path === "/scenarios") {
    return <RouteCards routes={workbenchScenarios.map((scenario) => `/scenarios/${scenario.slug}`)} basePath={basePath} navigate={navigate} />;
  }
  if (route.path === "/patterns") {
    return <RouteCards routes={workbenchPatterns.map((pattern) => `/patterns/${pattern.slug}`)} basePath={basePath} navigate={navigate} />;
  }
  if (route.path === "/sf") {
    return <RouteCards routes={workbenchSfPanels.map((panel) => `/sf/${panel.slug}`)} basePath={basePath} navigate={navigate} />;
  }
  return <RouteCards routes={workbenchRoutes.filter((candidate) => candidate.contract).slice(0, 160).map((candidate) => candidate.path)} basePath={basePath} navigate={navigate} />;
}

function RouteCards({ routes, basePath, navigate }: { routes: string[]; basePath: string; navigate: (path: string) => void }) {
  return (
    <div className="route-grid">
      {routes.map((path) => {
        const route = parseWorkbenchPath(path);
        return (
          <a key={path} className="route-card" href={withCatalogBasePath(basePath, path)} onClick={(event) => { event.preventDefault(); navigate(path); }}>
            <strong>{route.title}</strong>
            <br />
            <code>{path}</code>
          </a>
        );
      })}
    </div>
  );
}

function RouteContent({ internalPath, route, basePath, navigate }: { internalPath: string; route: WorkbenchRoute; basePath: string; navigate: (path: string) => void }) {
  if (route.family === "guide") {
    return <div dangerouslySetInnerHTML={{ __html: catalogGuideHtml(internalPath, "react", basePath) }} />;
  }
  if (internalPath === "/hooks") {
    return (
      <div className="route-grid">
        {catalogHooks.map((hook) => (
          <a key={hook.slug} className="route-card" href={withCatalogBasePath(basePath, `/hooks/${hook.slug}`)}>
            <strong>{hook.displayName}</strong><br />
            <span>{hook.description}</span>
          </a>
        ))}
      </div>
    );
  }
  if (internalPath.startsWith("/hooks/")) {
    return <HookFixture slug={internalPath.slice("/hooks/".length)} />;
  }
  if (route.family === "component" && route.slug) {
    const component = getComponentBySlug(route.slug);
    if (!component && route.slug !== "combobox") return <Unsupported family="component" slug={route.slug} reason="Unknown component route" />;
    const routes = route.path.endsWith("/states")
      ? catalogDemoFixtureIds((component?.slug ?? "combobox") as ComponentSlug, component ? component.states.slice(0, 8) : ["default", "open", "disabled", "invalid"]).map((state) => ({ ...route, fixtureId: state }))
      : route.path.endsWith("/qa") && route.contract
        ? route.contract.fixtures.map((fixture) => ({ ...route, path: fixture.route, fixtureId: fixture.id }))
        : [route];
    return (
      <>
        <div className="catalog-demo-tabs" data-catalog-demo-tabs>
          <div className="catalog-preview-toolbar">
            <div className="catalog-preview-tabs" role="tablist" aria-label={`${route.title} example`}>
              <button type="button" role="tab" aria-selected="true" aria-controls={`preview-${route.slug}`} data-catalog-demo-tab="preview"><i></i> Preview</button>
              <button type="button" role="tab" aria-selected="false" aria-controls={`preview-code-${route.slug}`} data-catalog-demo-tab="code">Code</button>
            </div>
            <a href={withCatalogBasePath(basePath, `/components/${route.slug}/states`)}>States</a>
            <a href={withCatalogBasePath(basePath, `/components/${route.slug}/qa`)}>QA cases</a>
          </div>
          <div id={`preview-${route.slug}`} role="tabpanel" data-catalog-demo-panel="preview">
            <h2 className="sr-only">{route.title} preview</h2>
            <div
              className="fixture-grid"
              data-catalog-state-grid={routes.length > 1 ? "true" : undefined}
            >
              {routes.map((fixtureRoute) => (
                <section key={`${route.slug}-${fixtureRoute.fixtureId ?? "default"}`} className="fixture-card">
                  <p className="eyebrow">{catalogDemoFixtureLabel(fixtureRoute.fixtureId)}</p>
                  <ComponentFixture slug={(component?.slug ?? "combobox") as ComponentSlug | "combobox"} route={fixtureRoute} />
                </section>
              ))}
            </div>
          </div>
          <div id={`preview-code-${route.slug}`} className="catalog-demo-code" role="tabpanel" data-catalog-demo-panel="code" hidden>
            <div dangerouslySetInnerHTML={{ __html: catalogDemoCodeHtml(route.slug, "react") }} />
          </div>
        </div>
        {route.path === `/components/${route.slug}` ? (
          <div dangerouslySetInnerHTML={{ __html: catalogComponentDetailsHtml(route.slug, "react", basePath) }} />
        ) : null}
      </>
    );
  }
  if (route.family === "pattern" && route.slug) return <PatternFixture slug={route.slug} route={route} />;
  if (route.family === "sf" && route.slug) return <SfFixture slug={route.slug} route={route} />;
  if (route.family === "scenario" && route.slug) {
    const scenario = getScenarioBySlug(route.slug);
    if (!scenario) return <Unsupported family="scenario" slug={route.slug} reason="Unknown scenario route" />;
    return <div dangerouslySetInnerHTML={{ __html: scenarioModelHtml(scenario) }} />;
  }
  return <Gallery route={route} basePath={basePath} navigate={navigate} />;
}

export function App({ basePath = "" }: { basePath?: string }) {
  const [internalPath, route, navigate] = useRoute(basePath);
  const theme = useMemo(() => new URLSearchParams(window.location.search).get("theme") || "light", [route.path]);
  const hook = internalPath.startsWith("/hooks/") ? getCatalogHookBySlug(internalPath.slice("/hooks/".length)) : undefined;
  const title = catalogPageTitle(internalPath, internalPath === "/hooks" ? "Hooks" : hook?.displayName ?? route.title);
  const description = catalogPageDescription(internalPath, route, "react");
  const shellRef = React.useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!shellRef.current) return undefined;
    activateCatalogUi(shellRef.current, {
      basePath,
      currentPath: internalPath,
      navigate,
    });
    updateCatalogDocumentMetadata(title, description, "react", internalPath);
    if (internalPath.startsWith("/hooks")) return undefined;
    return activateWorkbenchRoute(shellRef.current, route, { framework: "react" });
  }, [description, internalPath, route, title]);
  return (
    <div ref={shellRef} className="workbench-shell" style={catalogThemeStyle(theme) as React.CSSProperties} data-uifn-workbench="react" data-uifn-loaded="true" data-uifn-theme={theme}>
      <Nav basePath={basePath} />
      <main className="workbench-main" aria-labelledby="route-title" data-catalog-page={catalogPageKind(internalPath, route)}>
        <div className="catalog-topbar-host" dangerouslySetInnerHTML={{ __html: catalogTopbarHtml(basePath, "react", internalPath) }} />
        <header className="catalog-page-header">
          <p className="eyebrow">{catalogFrameworkLabel("react")} · uifn</p>
          <h1 id="route-title">{title}</h1>
          <p>{description}</p>
        </header>
        <RouteContent internalPath={internalPath} route={route} basePath={basePath} navigate={navigate} />
        <footer className="catalog-site-footer"><span>uifn · actual components, three native frameworks</span><a href="/components/">All frameworks</a></footer>
      </main>
    </div>
  );
}

const rootElement = typeof document === "undefined" ? null : document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
