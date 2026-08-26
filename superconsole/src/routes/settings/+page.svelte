<script lang="ts">
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { CardContent, CardDescription, CardHeader, CardRoot, CardTitle } from '@uifn/components-svelte/card';
  import { SwitchControl, SwitchRoot, SwitchThumb } from '@uifn/components-svelte/switch';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import StatePanel from '$lib/components/StatePanel.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { fetchAdmin, safeAdminDownloadHref } from '$lib/components/admin-api';
  import { refreshSuccessfulMutation } from '$lib/components/mutation-outcome';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let saving = $state<string | undefined>();
  let feedback = $state<string | undefined>();
  const intentKeys = new Map<string, string>();

  type Policy = NonNullable<NonNullable<PageData['settings']>['policies']>[number];

  async function updatePolicy(policy: Policy, enabled: boolean) {
    if (!policy.mutable || !policy.apiHref) return;
    saving = policy.id;
    feedback = undefined;
    const intent = `${policy.id}:${enabled}`;
    const idempotencyKey = intentKeys.get(intent) ?? crypto.randomUUID();
    intentKeys.set(intent, idempotencyKey);
    try {
      const endpoint = safeAdminDownloadHref(policy.apiHref, {
        origin: page.url.origin,
        scope: page.url.searchParams,
      });
      if (!endpoint) throw new Error('The policy endpoint is not a trusted administration API URL.');
      const result = await fetchAdmin<{ enabled?: boolean }>(
        globalThis.fetch,
        endpoint,
        { method: 'PATCH', headers: { 'idempotency-key': idempotencyKey }, body: JSON.stringify({ enabled }) }
      );
      if (!result.ok) {
        throw new Error(`${result.error.message}${result.error.requestId ? ` (request ${result.error.requestId})` : ''}`);
      }
      intentKeys.delete(intent);
      feedback = (await refreshSuccessfulMutation(`${policy.label} updated.`, invalidateAll)).message;
    } catch (cause) {
      feedback = cause instanceof Error ? cause.message : 'The policy update failed.';
    } finally {
      saving = undefined;
    }
  }
</script>

<PageHeader eyebrow="Self-hosted control plane" title="Settings" description="Deployment configuration, tenant scope, retention, and global administration policies." />

{#if data.loadError?.status === 403}
  <StatePanel kind="forbidden" error={data.loadError} />
{:else if data.loadError}
  <StatePanel kind="error" error={data.loadError} actionHref="/settings" actionLabel="Retry" />
{:else if data.settings}
  <div class="settings-overview">
    <div><span>Mode</span><StatusBadge label={data.settings.deploymentMode ?? 'Self-hosted'} tone="success" /></div>
    <div><span>Module registration</span><strong>{data.settings.configurationSource ?? 'Deploy-time configuration'}</strong></div>
    <div><span>Tenant hierarchy</span><code>{(data.settings.tenantHierarchy ?? ['organization', 'workspace', 'project', 'environment']).join(' → ')}</code></div>
  </div>

  <div class="settings-grid">
    <CardRoot class="settings-card">
      <CardHeader><CardTitle>Administration policies</CardTitle><CardDescription>Runtime-mutable policy changes are permission checked and audited. Enabled modules remain deploy-time configuration.</CardDescription></CardHeader>
      <CardContent>
        {#if !data.settings.policies?.length}
          <StatePanel kind="empty" title="No mutable policies" message="This deployment manages all global policy through configuration files." />
        {:else}
          <div class="policy-list">
            {#each data.settings.policies as policy (policy.id)}
              <SwitchRoot checked={policy.enabled} onCheckedChange={(enabled: boolean) => updatePolicy(policy, enabled)} class="policy-row">
                <span><strong>{policy.label}</strong><small>{policy.description ?? 'Global operator policy'}</small>{#if !policy.mutable}<code>deploy-time</code>{/if}</span>
                <SwitchControl disabled={!policy.mutable || saving === policy.id} aria-label={policy.label}><SwitchThumb /></SwitchControl>
              </SwitchRoot>
            {/each}
          </div>
        {/if}
        {#if feedback}<p class="settings-feedback" role="status">{feedback}</p>{/if}
      </CardContent>
    </CardRoot>

    <CardRoot class="settings-card">
      <CardHeader><CardTitle>Retention</CardTitle><CardDescription>Function-owned evidence and audit retention in the active environment.</CardDescription></CardHeader>
      <CardContent>
        {#if !data.settings.retention?.length}<StatePanel kind="empty" title="No retention summary" message="Retention is configured by each enabled Superfunction." />{:else}<dl class="detail-list">{#each data.settings.retention as item (item.label)}<div><dt>{item.label}</dt><dd>{item.value}</dd></div>{/each}</dl>{/if}
      </CardContent>
    </CardRoot>
  </div>
{/if}
