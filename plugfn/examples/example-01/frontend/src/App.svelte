<script lang="ts">
  import { onMount } from 'svelte';
  import { createPlugFnClient } from '@plugfn/client';
  import type { PlugFnConnectionSummary, PlugFnProviderSummary } from '@plugfn/client';

  // We initialize the client to point to our local backend
  const plugfn = createPlugFnClient({
    baseUrl: 'http://localhost:3000/api/plugfn',
    // In a real app we'd pass headers here with auth tokens
    headers: {
      Authorization: 'Bearer user_123',
    }
  });

  let providers: PlugFnProviderSummary[] = [];
  let connections: PlugFnConnectionSummary[] = [];
  let loadingProviders = true;
  let error: string | null = null;

  let selectedProviderData: any[] | null = null;
  let selectedProviderLoading = false;
  let selectedProviderName: string | null = null;

  async function loadIntegrations() {
    try {
      loadingProviders = true;
      // List available providers
      providers = await plugfn.listProviders();
      // List active connections for this user
      connections = await plugfn.listConnections();
    } catch (e: any) {
      error = e.message;
    } finally {
      loadingProviders = false;
    }
  }

  onMount(() => {
    loadIntegrations();
  });

  async function connect(providerName: string) {
    try {
      // Initiates the OAuth flow. The client returns an authUrl we redirect to.
      const res = await plugfn.startConnection({
        provider: providerName,
        returnTo: `${window.location.origin}${window.location.pathname}`,
      });
      if (res.authUrl) {
        window.location.href = res.authUrl;
      }
    } catch (e: any) {
      error = e.message;
    }
  }

  async function disconnect(connectionId: string, provider: string) {
    try {
      await plugfn.disconnect({ provider, connectionId });
      await loadIntegrations(); // refresh
      if (selectedProviderName && !connections.some(c => c.provider === selectedProviderName)) {
        selectedProviderName = null;
        selectedProviderData = null;
      }
    } catch (e: any) {
      error = e.message;
    }
  }

  async function loadData(providerName: string) {
    selectedProviderName = providerName;
    selectedProviderLoading = true;
    selectedProviderData = null;
    error = null;

    try {
      // Hit our backend proxy endpoint
      const res = await fetch(`http://localhost:3000/api/data/${providerName}`, {
        headers: { Authorization: 'Bearer user_123' }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load data');
      }
      selectedProviderData = data;
    } catch (e: any) {
      error = e.message;
    } finally {
      selectedProviderLoading = false;
    }
  }

  // Get dynamic keys for table
  $: keys = selectedProviderData && selectedProviderData.length > 0
    ? Object.keys(selectedProviderData[0]).filter(k => typeof selectedProviderData![0][k] !== 'object')
    : [];

  function isConnected(providerName: string) {
    return connections.some(c => c.provider === providerName && c.status === 'active');
  }

  function getConnectionId(providerName: string) {
    return connections.find(c => c.provider === providerName)?.id;
  }
</script>

<main class="container">
  <h1>PlugFn Example 01</h1>
  <p>Available Integrations:</p>

  {#if error}
    <div class="error">{error}</div>
  {/if}

  {#if loadingProviders}
    <p>Loading...</p>
  {:else}
    <div class="card-grid">
      {#each providers as provider}
        <div class="card">
          <div class="card-header">
            <h3>{provider.displayName || provider.name}</h3>
            {#if isConnected(provider.name)}
              <span class="badge success">Connected</span>
            {:else}
              <span class="badge">Not Connected</span>
            {/if}
          </div>

          <div class="card-actions">
            {#if isConnected(provider.name)}
              <button on:click={() => loadData(provider.name)}>View Data</button>
              <button class="danger" on:click={() => disconnect(getConnectionId(provider.name)!, provider.name)}>Disconnect</button>
            {:else}
              <button on:click={() => connect(provider.name)}>Connect</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <hr />

  {#if selectedProviderName}
    <h2>Data from {selectedProviderName}</h2>
    {#if selectedProviderLoading}
      <p>Loading data...</p>
    {:else if selectedProviderData && selectedProviderData.length > 0}
      <div class="table-container">
        <table>
          <thead>
            <tr>
              {#each keys as key}
                <th>{key}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each selectedProviderData as row}
              <tr>
                {#each keys as key}
                  <td>{row[key]}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if selectedProviderData}
      <p>No data returned or returned empty array.</p>
    {/if}
  {/if}
</main>

<style>
  :global(body) {
    font-family: system-ui, -apple-system, sans-serif;
    background-color: #f4f4f5;
    margin: 0;
    padding: 0;
    color: #333;
  }
  .container {
    max-width: 1000px;
    margin: 2rem auto;
    padding: 1rem;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  }
  .error {
    color: red;
    padding: 1rem;
    background: #ffebee;
    border-radius: 4px;
    margin-bottom: 1rem;
  }
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }
  .card {
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  .card h3 {
    margin: 0;
    font-size: 1.1rem;
  }
  .badge {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    background: #eee;
    color: #555;
  }
  .badge.success {
    background: #e8f5e9;
    color: #2e7d32;
  }
  .card-actions {
    display: flex;
    gap: 0.5rem;
  }
  button {
    background: #007bff;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
  }
  button:hover {
    background: #0056b3;
  }
  button.danger {
    background: #dc3545;
  }
  button.danger:hover {
    background: #b02a37;
  }

  .table-container {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
  }
  th, td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid #ddd;
  }
  th {
    background-color: #f8f9fa;
  }
</style>
