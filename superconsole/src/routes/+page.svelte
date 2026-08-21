<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { ButtonIcon, ButtonLabel, ButtonRoot } from '@uifn/components-svelte/button';
  import {
    CardAction,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardRoot,
    CardTitle,
  } from '@uifn/components-svelte/card';
  import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRoot,
    TableRow,
    TableTable,
  } from '@uifn/components-svelte/table';
  import ConsoleIcon from '$lib/components/ConsoleIcon.svelte';
  import MetricCard from '$lib/components/MetricCard.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import StatePanel from '$lib/components/StatePanel.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { safeConsoleNavigationHref, scopedConsoleHref } from '$lib/components/admin-api';
  import { consoleDestinationEnabled, enabledNavigationModules, formatValue, shellSurfaceEnabled } from '$lib/components/view-models';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const modules = $derived(enabledNavigationModules(data.shell.registry));
  const auditEnabled = $derived(shellSurfaceEnabled(data.shell.registry, 'audit'));
  const settingsEnabled = $derived(shellSurfaceEnabled(data.shell.registry, 'settings'));
  const metrics = $derived(data.shell.overview.metrics.length
    ? data.shell.overview.metrics
    : [{
        id: 'enabled-modules',
        label: 'Enabled modules',
        value: modules.length,
        detail: 'Selected for this self-hosted deployment',
        tone: 'info' as const,
      }]);

  function navigate(href: string) {
    const safeHref = safeConsoleNavigationHref(href, page.url.origin);
    if (safeHref) void goto(scopedConsoleHref(safeHref, page.url.searchParams));
  }
</script>

<PageHeader
  eyebrow="Platform operations"
  title="Overview"
  description="Health, activity, and administration for the Superfunctions enabled in this deployment."
/>

  {#if data.shell.error?.status === 401}
  <StatePanel kind="forbidden" title="Authentication required" message="Sign in through the configured operator-auth provider to access administration." actionHref="/sign-in" actionLabel="Sign in" />
  {:else if data.shell.error?.status === 403}
    <StatePanel kind="forbidden" error={data.shell.error} />
  {:else if data.shell.error}
    <StatePanel kind="error" error={data.shell.error} />
  {:else if data.shell.overviewError?.status === 403}
    <StatePanel kind="forbidden" title="Overview restricted" error={data.shell.overviewError} message="Your operator role can use permitted module surfaces, but not the platform overview." />
  {:else if data.shell.overviewError}
    <StatePanel kind="error" error={data.shell.overviewError} actionHref="/" actionLabel="Retry" />
  {:else}
  <section class="metrics-grid" aria-label="Platform metrics">
    {#each metrics as metric (metric.id)}
      <MetricCard {metric} />
    {/each}
  </section>

  <div class="overview-grid">
    <section class="overview-grid__main" aria-labelledby="enabled-modules-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Deployment registry</p>
          <h2 id="enabled-modules-heading">Enabled modules</h2>
        </div>
        <StatusBadge label={`${modules.length} active`} tone="success" />
      </div>
      {#if modules.length === 0}
        <StatePanel kind="empty" title="No modules enabled" message="Register at least one Superfunction in the deploy-time console configuration." actionHref={settingsEnabled ? '/settings' : undefined} actionLabel={settingsEnabled ? 'Review configuration' : undefined} />
      {:else}
        <div class="module-grid">
          {#each modules as module (module.id)}
            <CardRoot class="module-card">
              <CardHeader>
                <div class="module-card__mark" aria-hidden="true">{module.name.slice(0, 2).toUpperCase()}</div>
                <CardTitle>{module.name}</CardTitle>
                <CardDescription>{module.description}</CardDescription>
                <CardAction><StatusBadge status={module.health ?? 'unknown'} label={module.healthLabel ?? module.health ?? 'Unknown'} /></CardAction>
              </CardHeader>
              <CardContent>
                <div class="module-card__meta">
                  <span>{module.resources?.length ?? 0} resource types</span>
                  {#if module.version}<code>v{module.version}</code>{/if}
                </div>
              </CardContent>
              <CardFooter>
                <ButtonRoot variant="ghost" size="sm" onclick={() => navigate(module.href)}>
                  <ButtonLabel>Open {module.name}</ButtonLabel>
                  <ButtonIcon><ConsoleIcon name="arrow-right" /></ButtonIcon>
                </ButtonRoot>
              </CardFooter>
            </CardRoot>
          {/each}
        </div>
      {/if}
    </section>

    <aside class="overview-grid__aside" aria-labelledby="alerts-heading" id="alerts">
      <div class="section-heading">
        <div><p class="eyebrow">Operations</p><h2 id="alerts-heading">Alerts</h2></div>
        <StatusBadge label={String(data.shell.overview.alerts.length)} tone={data.shell.overview.alerts.length ? 'warning' : 'neutral'} />
      </div>
      {#if data.shell.overview.alerts.length === 0}
        <StatePanel kind="empty" title="No active alerts" message="No injected overview provider has reported anything requiring operator attention." />
      {:else}
        <div class="alert-stack">
          {#each data.shell.overview.alerts as alert (alert.id)}
            <CardRoot class={`alert-card alert-card--${alert.tone}`}>
              <CardHeader>
                <StatusBadge status={alert.tone} />
                <CardTitle>{alert.title}</CardTitle>
                <CardDescription>{alert.message}</CardDescription>
              </CardHeader>
              {#if alert.href && consoleDestinationEnabled(data.shell.registry, alert.href)}
                <CardFooter>
                  <ButtonRoot variant="ghost" size="sm" onclick={() => navigate(alert.href!)}>
                    <ButtonLabel>Investigate</ButtonLabel><ButtonIcon><ConsoleIcon name="arrow-right" /></ButtonIcon>
                  </ButtonRoot>
                </CardFooter>
              {/if}
            </CardRoot>
          {/each}
        </div>
      {/if}
    </aside>
  </div>

  <section class="activity-section" aria-labelledby="activity-heading">
    <div class="section-heading">
      <div><p class="eyebrow">{auditEnabled ? 'Operator audit' : 'Operator activity'}</p><h2 id="activity-heading">Recent operator activity</h2></div>
      {#if auditEnabled}
        <ButtonRoot variant="outline" size="sm" onclick={() => navigate('/audit')}>
          <ButtonLabel>Full audit trail</ButtonLabel><ButtonIcon><ConsoleIcon name="arrow-right" /></ButtonIcon>
        </ButtonRoot>
      {/if}
    </div>
    {#if data.shell.overview.activity.length === 0}
      <StatePanel kind="empty" title="No activity in this scope" message="Audited operator and MCP mutations will appear here." />
    {:else}
      <TableRoot>
        <TableTable>
          <TableHeader><TableRow value="header"><TableHead value="actor">Actor</TableHead><TableHead value="action">Action</TableHead><TableHead value="target">Target</TableHead><TableHead value="outcome">Outcome</TableHead><TableHead value="time">Time</TableHead></TableRow></TableHeader>
          <TableBody>
            {#each data.shell.overview.activity as activity (activity.id)}
              <TableRow value={activity.id}>
                <TableCell value={`${activity.id}-actor`}><strong>{activity.actor}</strong></TableCell>
                <TableCell value={`${activity.id}-action`}>{activity.action}</TableCell>
                <TableCell value={`${activity.id}-target`}><code>{activity.target}</code></TableCell>
                <TableCell value={`${activity.id}-outcome`}><StatusBadge status={activity.outcome} /></TableCell>
                <TableCell value={`${activity.id}-time`}>{formatValue(activity.occurredAt, 'datetime')}</TableCell>
              </TableRow>
            {/each}
          </TableBody>
        </TableTable>
      </TableRoot>
    {/if}
  </section>
{/if}
