<script lang="ts">
  import { onMount } from "svelte";
  import { toSvelteStore } from "@datafn/svelte";
  import {
    activityLog,
    attemptCrossWorkspaceShare,
    client,
    clientNamespace,
    createDocument,
    fetchDocumentPermissions,
    grantTeamDesignScopeViewer,
    initializeDemoClient,
    pullNow,
    readClientNamespace,
    resetBaselineAndResync,
    revokeTeamDesignScopeGrant,
    saveDocument,
    shareDocumentRecord,
    serverContext,
    syncStatus,
    switchingSession,
    unshareDocumentRecord,
    type DocumentRecord,
    type PermissionGrant,
  } from "./lib/datafn";
  import { demoBootstrap, demoSession, setUserId, setWorkspaceId } from "./lib/demoSession";
  import {
    DEMO_USERS,
    fetchDemoContext,
    readErrorCode,
    type DemoUserId,
    type DemoWorkspaceId,
  } from "./lib/api";
  import "@21n/fonts/styles.css";

  const documentsStore = toSvelteStore(
    client.table("documents").signal({ sort: ["title:asc", "id:asc"] }),
  );

  let initializing = true;
  let initErrorCode: string | null = null;

  let createTitle = "";
  let createContent = "";
  let createErrorCode: string | null = null;

  let selectedDocumentId: string | null = null;
  let editTitle = "";
  let editContent = "";
  let saveErrorCode: string | null = null;

  let permissionRows: PermissionGrant[] = [];
  let permissionsLoading = false;
  let permissionsErrorCode: string | null = null;
  let lastPermissionKey = "";

  let sharePrincipalId: DemoUserId = "user:bob";
  let shareLevel: "viewer" | "editor" = "viewer";
  let shareErrorCode: string | null = null;
  let unshareErrorCode: string | null = null;

  let scopeGrantErrorCode: string | null = null;
  let scopeRevokeErrorCode: string | null = null;
  let pullErrorCode: string | null = null;
  let resetErrorCode: string | null = null;

  let crossWorkspaceTargetWorkspaceId: DemoWorkspaceId = "globex";
  let crossWorkspacePrincipalId: DemoUserId = "user:bob";
  let crossWorkspaceErrorCode: string | null = null;

  let teamPreviewRows: Array<{
    userId: DemoUserId;
    inheritsTeamDesign: boolean;
    effectivePrincipals: string[];
  }> = [];
  let teamPreviewLoading = false;
  let teamPreviewErrorCode: string | null = null;
  let lastTeamPreviewWorkspaceKey = "";

  $: workspaces = $demoBootstrap?.workspaces ?? [];
  $: activeWorkspace = workspaces.find((workspace) => workspace.id === $demoSession.workspaceId) ?? null;
  $: workspaceUsers = activeWorkspace?.users ?? [];
  $: otherWorkspaceIds = workspaces
    .map((workspace) => workspace.id)
    .filter((workspaceId) => workspaceId !== $demoSession.workspaceId);

  $: {
    if (
      otherWorkspaceIds.length > 0 &&
      !otherWorkspaceIds.includes(crossWorkspaceTargetWorkspaceId)
    ) {
      crossWorkspaceTargetWorkspaceId = otherWorkspaceIds[0];
    }
  }

  $: documents = (($documentsStore.data ?? []) as DocumentRecord[]).slice();
  $: {
    if (documents.length === 0) {
      selectedDocumentId = null;
    } else if (!selectedDocumentId || !documents.some((doc) => doc.id === selectedDocumentId)) {
      selectDocument(documents[0]);
    }
  }

  $: selectedDocument =
    selectedDocumentId === null
      ? null
      : documents.find((doc) => doc.id === selectedDocumentId) ?? null;

  $: {
    const key = `${$demoSession.workspaceId}:${$demoSession.userId}:${selectedDocumentId ?? "none"}`;
    if (key !== lastPermissionKey) {
      lastPermissionKey = key;
      void loadPermissions();
    }
  }

  $: {
    if (!initializing && activeWorkspace) {
      const key = `${$demoSession.workspaceId}`;
      if (key !== lastTeamPreviewWorkspaceKey) {
        lastTeamPreviewWorkspaceKey = key;
        void loadTeamPreviewRows();
      }
    }
  }

  $: localNamespace = $clientNamespace ?? readClientNamespace() ?? $demoSession.localNamespace;

  onMount(async () => {
    try {
      await initializeDemoClient();
    } catch (error) {
      initErrorCode = readErrorCode(error);
    } finally {
      initializing = false;
    }
  });

  function selectDocument(document: DocumentRecord) {
    selectedDocumentId = document.id;
    editTitle = document.title;
    editContent = document.content;
    saveErrorCode = null;
  }

  async function handleCreateDocument() {
    const title = createTitle.trim();
    const content = createContent.trim();
    if (!title || !content) {
      return;
    }

    try {
      createErrorCode = null;
      await createDocument({ title, content });
      createTitle = "";
      createContent = "";
    } catch (error) {
      createErrorCode = readErrorCode(error);
    }
  }

  async function handleSaveDocument() {
    if (!selectedDocumentId) {
      return;
    }

    try {
      saveErrorCode = null;
      await saveDocument({
        id: selectedDocumentId,
        title: editTitle.trim(),
        content: editContent.trim(),
      });
      await loadPermissions();
    } catch (error) {
      saveErrorCode = readErrorCode(error);
    }
  }

  async function loadPermissions() {
    if (!selectedDocumentId) {
      permissionRows = [];
      permissionsErrorCode = null;
      return;
    }

    permissionsLoading = true;
    try {
      permissionsErrorCode = null;
      permissionRows = await fetchDocumentPermissions(selectedDocumentId);
    } catch (error) {
      permissionsErrorCode = readErrorCode(error);
      permissionRows = [];
    } finally {
      permissionsLoading = false;
    }
  }

  async function handleShareRecord() {
    if (!selectedDocumentId) {
      return;
    }

    try {
      shareErrorCode = null;
      await shareDocumentRecord({
        id: selectedDocumentId,
        principalId: sharePrincipalId,
        level: shareLevel,
      });
      await loadPermissions();
    } catch (error) {
      shareErrorCode = readErrorCode(error);
    }
  }

  async function handleUnshareRecord() {
    if (!selectedDocumentId) {
      return;
    }

    try {
      unshareErrorCode = null;
      await unshareDocumentRecord({
        id: selectedDocumentId,
        principalId: sharePrincipalId,
      });
      await loadPermissions();
    } catch (error) {
      unshareErrorCode = readErrorCode(error);
    }
  }

  async function handleGrantTeamScope() {
    try {
      scopeGrantErrorCode = null;
      await grantTeamDesignScopeViewer();
      await Promise.all([loadPermissions(), loadTeamPreviewRows()]);
    } catch (error) {
      scopeGrantErrorCode = readErrorCode(error);
    }
  }

  async function handleRevokeTeamScope() {
    try {
      scopeRevokeErrorCode = null;
      await revokeTeamDesignScopeGrant();
      await Promise.all([loadPermissions(), loadTeamPreviewRows()]);
    } catch (error) {
      scopeRevokeErrorCode = readErrorCode(error);
    }
  }

  async function handleCrossWorkspaceShareAttempt() {
    if (!selectedDocumentId) {
      return;
    }

    try {
      crossWorkspaceErrorCode = null;
      await attemptCrossWorkspaceShare({
        id: selectedDocumentId,
        targetWorkspaceId: crossWorkspaceTargetWorkspaceId,
        principalId: crossWorkspacePrincipalId,
      });
    } catch (error) {
      crossWorkspaceErrorCode = readErrorCode(error);
    }
  }

  async function handlePullNow() {
    try {
      pullErrorCode = null;
      await pullNow();
      await loadPermissions();
    } catch (error) {
      pullErrorCode = readErrorCode(error);
    }
  }

  async function handleResetBaseline() {
    try {
      resetErrorCode = null;
      await resetBaselineAndResync();
      await Promise.all([loadPermissions(), loadTeamPreviewRows()]);
    } catch (error) {
      resetErrorCode = readErrorCode(error);
    }
  }

  async function loadTeamPreviewRows() {
    if (!activeWorkspace) {
      teamPreviewRows = [];
      teamPreviewErrorCode = null;
      return;
    }

    teamPreviewLoading = true;
    try {
      teamPreviewErrorCode = null;
      const contexts = await Promise.all(
        activeWorkspace.users.map(async (userId) => {
          const context = await fetchDemoContext({
            workspaceId: $demoSession.workspaceId,
            userId,
          });

          return {
            userId,
            context,
          };
        }),
      );

      teamPreviewRows = contexts.map(({ userId, context }) => ({
        userId,
        inheritsTeamDesign: context.effectivePrincipals.includes("team:design"),
        effectivePrincipals: context.effectivePrincipals,
      }));
    } catch (error) {
      teamPreviewRows = [];
      teamPreviewErrorCode = readErrorCode(error);
    } finally {
      teamPreviewLoading = false;
    }
  }

  function handleWorkspaceChange(event: Event) {
    const workspaceId = (event.currentTarget as HTMLSelectElement).value as DemoWorkspaceId;
    setWorkspaceId(workspaceId);
  }

  function handleUserChange(event: Event) {
    const userId = (event.currentTarget as HTMLSelectElement).value as DemoUserId;
    setUserId(userId);
  }
</script>

<main class="app-shell">
  <header class="app-header">
    <h1>DataFn Sharing App</h1>
    <p>Phase 04: team scope grants, workspace isolation, and cross-workspace denial behavior.</p>
  </header>

  <section class="panel controls-panel">
    <h2>Demo Session</h2>
    <div class="controls-grid">
      <label>
        Workspace
        <select
          data-testid="workspace-select"
          value={$demoSession.workspaceId}
          on:change={handleWorkspaceChange}
        >
          {#each workspaces as workspace}
            <option value={workspace.id}>{workspace.id}</option>
          {/each}
        </select>
      </label>

      <label>
        User
        <select
          data-testid="user-select"
          value={$demoSession.userId}
          on:change={handleUserChange}
        >
          {#each workspaceUsers as userId}
            <option value={userId}>{userId}</option>
          {/each}
        </select>
      </label>
    </div>
    {#if $switchingSession}
      <p class="status-line">Switching context…</p>
    {/if}
  </section>

  <section class="panel sync-panel">
    <h2>Sync Status & Deterministic Controls</h2>
    <p data-testid="sync-status-line" class="status-line">
      Status:
      {#if $syncStatus.resetInProgress}
        reset in progress
      {:else if $syncStatus.pullInProgress}
        pull in progress
      {:else if $syncStatus.running}
        running
      {:else}
        idle
      {/if}
      {#if $syncStatus.lastEvent}
        · last event: <code>{$syncStatus.lastEvent}</code>
      {/if}
    </p>
    <div class="sync-actions">
      <button data-testid="pull-now-submit" type="button" on:click={handlePullNow} disabled={$syncStatus.pullInProgress || $syncStatus.resetInProgress}>
        Pull now
      </button>
      <button data-testid="reset-resync-submit" type="button" class="secondary" on:click={handleResetBaseline} disabled={$syncStatus.resetInProgress}>
        Reset baseline + resync
      </button>
    </div>
    {#if $syncStatus.lastPullAt}
      <p class="status-line">
        Last pull: {new Date($syncStatus.lastPullAt).toLocaleTimeString()} · outcome:
        {$syncStatus.lastPullOutcome ?? "unknown"}
      </p>
    {/if}
    {#if $syncStatus.lastErrorCode}
      <p class="status-line error">Last sync error: {$syncStatus.lastErrorCode}</p>
    {/if}
    {#if pullErrorCode}
      <p class="status-line error">Pull failed: {pullErrorCode}</p>
    {/if}
    {#if resetErrorCode}
      <p class="status-line error">Reset/resync failed: {resetErrorCode}</p>
    {/if}
    <p class="status-line">
      Two-context demo: keep Alice and Bob open in separate browser contexts, apply grant/revoke as Alice,
      then click <strong>Pull now</strong> in Bob to observe backfill/removal deterministically.
    </p>
  </section>

  <section class="panel context-panel">
    <h2>Context Panel</h2>
    {#if initializing}
      <p class="status-line">Loading demo bootstrap…</p>
    {:else if initErrorCode}
      <p class="status-line error">Initialization failed: {initErrorCode}</p>
    {:else if $serverContext}
      <dl class="context-grid">
        <div>
          <dt>Workspace ID</dt>
          <dd data-testid="context-workspace">{$serverContext.workspaceId}</dd>
        </div>
        <div>
          <dt>Server namespace</dt>
          <dd data-testid="context-namespace">{$serverContext.namespace}</dd>
        </div>
        <div>
          <dt>Actor ID</dt>
          <dd data-testid="context-actor">{$serverContext.actorId}</dd>
        </div>
        <div>
          <dt>Local browser namespace</dt>
          <dd data-testid="context-local-namespace">{localNamespace}</dd>
        </div>
      </dl>
      <div class="principal-row">
        <h3>Effective principals</h3>
        <div class="badge-wrap">
          {#each $serverContext.effectivePrincipals as principal}
            <span class="badge">{principal}</span>
          {/each}
        </div>
      </div>
    {:else}
      <p class="status-line">Context unavailable.</p>
    {/if}
  </section>
<section class="panel docs-panel">
  <div class="editor-panel">
    <h3>Create document</h3>
    <label>
      Title
      <input data-testid="create-title" bind:value={createTitle} maxlength={200} placeholder="Quarterly Notes" />
    </label>
    <label>
      Content
      <textarea data-testid="create-content" bind:value={createContent} rows={4} placeholder="Draft" />
    </label>
    <button data-testid="create-submit" type="button" on:click={handleCreateDocument}>Create</button>
    {#if createErrorCode}
      <p class="status-line error">Create failed: {createErrorCode}</p>
    {/if}
  </div>
</section>
  <section class="panel docs-panel">
    <h2>Documents</h2>
    <div class="docs-layout">
      <aside class="document-list">
        <h3>Visible list</h3>
        {#if $documentsStore.loading}
          <p class="status-line">Loading documents…</p>
        {:else if documents.length === 0}
          <p class="status-line">No visible records in this context.</p>
        {:else}
          <ul>
            {#each documents as document}
              <li>
                <button
                  type="button"
                  data-testid={`doc-item-${document.id}`}
                  class:selected={selectedDocumentId === document.id}
                  on:click={() => selectDocument(document)}
                >
                  <strong>{document.title}</strong>
                  <small>{document.id}</small>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </aside>


      <div class="editor-panel">


        <h3>Edit selected document</h3>
        {#if selectedDocument}
          <p class="status-line">Editing: {selectedDocument.id}</p>
          <label>
            Title
            <input data-testid="edit-title" bind:value={editTitle} maxlength={200} />
          </label>
          <label>
            Content
            <textarea data-testid="edit-content" bind:value={editContent} rows={6} />
          </label>
          <button data-testid="save-submit" type="button" on:click={handleSaveDocument}>Save changes</button>
          {#if saveErrorCode}
            <p class="status-line error">Save failed: {saveErrorCode}</p>
          {/if}

          <h3>Record share controls</h3>
          <p class="status-line">Use this panel to test owner-only share/unshare behavior.</p>
          <div class="share-grid">
            <label>
              Principal
              <select data-testid="share-principal" bind:value={sharePrincipalId}>
                {#each DEMO_USERS as userId}
                  <option value={userId}>{userId}</option>
                {/each}
              </select>
            </label>
            <label>
              Level
              <select data-testid="share-level" bind:value={shareLevel}>
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
              </select>
            </label>
          </div>
          <div class="share-actions">
            <button data-testid="share-submit" type="button" on:click={handleShareRecord}>Share / update grant</button>
            <button data-testid="unshare-submit" type="button" class="secondary danger" on:click={handleUnshareRecord}>
              Unshare principal
            </button>
          </div>
          {#if shareErrorCode}
            <p class="status-line error">Share failed: {shareErrorCode}</p>
          {/if}
          {#if unshareErrorCode}
            <p class="status-line error">Unshare failed: {unshareErrorCode}</p>
          {/if}

          <h3>Permission inspector (getPermissions)</h3>
          {#if permissionsLoading}
            <p class="status-line">Loading permissions…</p>
          {:else if permissionsErrorCode}
            <p class="status-line error">Inspector failed: {permissionsErrorCode}</p>
          {:else if permissionRows.length === 0}
            <p class="status-line">No explicit grants on this record.</p>
          {:else}
            <ul data-testid="permissions-list" class="permission-list">
              {#each permissionRows as grant}
                <li>
                  <code>{grant.principalId}</code>
                  <span class="grant-level">{grant.level}</span>
                  {#if grant.grantKind}
                    <span class="grant-kind">{grant.grantKind}</span>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}

          <h3>Scope grant panel (`team:design`)</h3>
          <p class="status-line">
            Scope grants are workspace-scoped. In <code>{$demoSession.workspaceId}</code>, only actors
            whose effective principals include <code>team:design</code> should inherit access.
          </p>
          <div class="share-actions">
            <button data-testid="scope-grant-submit" type="button" on:click={handleGrantTeamScope}>
              Grant team:design viewer scope
            </button>
            <button data-testid="scope-revoke-submit" type="button" class="secondary danger" on:click={handleRevokeTeamScope}>
              Revoke team:design scope
            </button>
          </div>
          {#if scopeGrantErrorCode}
            <p class="status-line error">Scope grant failed: {scopeGrantErrorCode}</p>
          {/if}
          {#if scopeRevokeErrorCode}
            <p class="status-line error">Scope unshare failed: {scopeRevokeErrorCode}</p>
          {/if}

          <h3>Team inheritance preview ({$demoSession.workspaceId})</h3>
          {#if teamPreviewLoading}
            <p class="status-line">Loading team membership preview…</p>
          {:else if teamPreviewErrorCode}
            <p class="status-line error">Team preview failed: {teamPreviewErrorCode}</p>
          {:else}
            <ul class="permission-list">
              {#each teamPreviewRows as row}
                <li>
                  <code>{row.userId}</code>
                  <span class:grant-level={row.inheritsTeamDesign} class:grant-kind={!row.inheritsTeamDesign}>
                    {row.inheritsTeamDesign ? "inherits team:design" : "not in team:design"}
                  </span>
                  <small>{row.effectivePrincipals.join(", ")}</small>
                </li>
              {/each}
            </ul>
          {/if}

          <h3>Cross-workspace denial check</h3>
          <p class="status-line">
            This attempts a share to a principal explicitly marked for another workspace and should fail
            with a deterministic error.
          </p>
          <div class="share-grid">
            <label>
              Target workspace
              <select data-testid="cross-target-workspace" bind:value={crossWorkspaceTargetWorkspaceId}>
                {#each otherWorkspaceIds as workspaceId}
                  <option value={workspaceId}>{workspaceId}</option>
                {/each}
              </select>
            </label>
            <label>
              Target principal
              <select data-testid="cross-target-principal" bind:value={crossWorkspacePrincipalId}>
                {#each DEMO_USERS as userId}
                  <option value={userId}>{userId}</option>
                {/each}
              </select>
            </label>
          </div>
          <button
            data-testid="cross-share-submit"
            type="button"
            class="secondary danger"
            on:click={handleCrossWorkspaceShareAttempt}
            disabled={otherWorkspaceIds.length === 0}
          >
            Attempt cross-workspace share
          </button>
          {#if crossWorkspaceErrorCode}
            <p class="status-line error">Cross-workspace share failed: {crossWorkspaceErrorCode}</p>
          {/if}
        {:else}
          <p class="status-line">Select a visible document to edit.</p>
        {/if}
      </div>
    </div>
  </section>

  <section class="panel activity-panel">
    <h2>Activity / Status</h2>
    <ul data-testid="activity-list">
      {#each $activityLog as item}
        <li class:error={item.level === "error"}>
          <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
          <span>{item.message}</span>
          {#if item.code}
            <code>{item.code}</code>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
</main>
