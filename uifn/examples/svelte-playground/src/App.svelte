<script lang="ts">
  import { onMount } from "svelte";
  import { Badge } from "@uifn/svelte";
  import {
    capabilitySupport,
    defaultExampleRoute,
    getScenarioRoute,
    normalizeExampleRoute,
    scenarios,
    type ExampleCapabilitySupport,
    type ExampleRouteHash,
    type ExampleScenarioId,
  } from "@uifn/examples-shared";
  import CommandCenterScenario from "./scenarios/CommandCenterScenario.svelte";
  import SettingsConsoleScenario from "./scenarios/SettingsConsoleScenario.svelte";
  import TeamDirectoryScenario from "./scenarios/TeamDirectoryScenario.svelte";
  import VirtualizedResultsScenario from "./scenarios/VirtualizedResultsScenario.svelte";

  const svelteCapabilityMatrix: ExampleCapabilitySupport[] = capabilitySupport.filter(
    (entry) => entry.adapter === "svelte",
  );

  let route: ExampleRouteHash = defaultExampleRoute;

  function syncRoute(hash?: string) {
    const normalized = normalizeExampleRoute(hash);
    route = normalized;

    if (typeof window !== "undefined" && window.location.hash !== normalized) {
      window.location.hash = normalized;
    }
  }

  onMount(() => {
    syncRoute(window.location.hash);

    const handleHashChange = () => syncRoute(window.location.hash);
    window.addEventListener("hashchange", handleHashChange);

    return () => window.removeEventListener("hashchange", handleHashChange);
  });

  $: activeScenarioId = route.replace("#/", "") as ExampleScenarioId;
  $: activeScenario = scenarios.find((scenario) => scenario.id === activeScenarioId) ?? scenarios[0];
</script>

<main class="app-shell">
  <section class="hero-panel">
    <div>
      <p class="eyebrow">uifn examples</p>
      <h1>Svelte Playground</h1>
      <p class="hero-copy">
        Scenario-driven demos for the GA Svelte adapter, using the shared example registry and
        capability matrix.
      </p>
    </div>
    <Badge class="adapter-badge">Svelte</Badge>
  </section>

  <div class="workspace-grid">
    <aside class="panel navigation-panel" aria-label="Scenario navigation">
      <h2>Scenarios</h2>
      <nav>
        <ul class="scenario-list">
          {#each scenarios as scenario (scenario.id)}
            <li>
              <a
                class:active={scenario.id === activeScenario.id}
                class="scenario-link"
                href={getScenarioRoute(scenario.id)}
                aria-current={scenario.id === activeScenario.id ? "page" : undefined}
              >
                <span>{scenario.title}</span>
                <small>{scenario.description}</small>
              </a>
            </li>
          {/each}
        </ul>
      </nav>
    </aside>

    <section class="panel scenario-panel" aria-labelledby="active-scenario-heading">
      <div class="panel-heading">
        <div>
          <p class="section-label">Active route</p>
          <h2 id="active-scenario-heading">{activeScenario.title}</h2>
        </div>
        <code>{route}</code>
      </div>
      <p class="scenario-description">{activeScenario.description}</p>

      {#if activeScenario.id === "settings-console"}
        <SettingsConsoleScenario {route} />
      {:else if activeScenario.id === "team-directory"}
        <TeamDirectoryScenario {route} />
      {:else if activeScenario.id === "command-center"}
        <CommandCenterScenario {route} />
      {:else}
        <VirtualizedResultsScenario {route} />
      {/if}
    </section>

    <aside class="panel capability-panel">
      <h2>Capability Matrix</h2>
      <div class="matrix-wrapper">
        <table class="capability-table">
          <caption class="sr-only">Svelte adapter capability support</caption>
          <thead>
            <tr>
              <th scope="col">Capability</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {#each svelteCapabilityMatrix as entry (entry.capability)}
              <tr>
                <th scope="row">{entry.capability}</th>
                <td>
                  <span class:unsupported={entry.status === "unsupported"} class="status-chip">
                    {entry.status}
                  </span>
                  {#if entry.note}
                    <small>{entry.note}</small>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </aside>
  </div>
</main>
