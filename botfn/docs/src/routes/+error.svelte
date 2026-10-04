<script lang="ts">
  import { page } from "$app/stores";
</script>

<svelte:head>
  <title>{$page.status} — BotFn docs</title>
</svelte:head>

<main class="docsfn-layout">
  <h1>{$page.status}</h1>
  <p>{$page.error?.message ?? "Unable to load this page."}</p>
</main>
