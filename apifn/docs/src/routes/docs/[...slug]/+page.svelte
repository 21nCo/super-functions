<script lang="ts">
  import DocsContent from "@docsfn/svelte/DocsContent.svelte";
  import DocsLayout from "@docsfn/svelte/DocsLayout.svelte";
  import ApiReferenceRenderer from "@docsfn/svelte/ApiReferenceRenderer.svelte";
  import Breadcrumbs from "@docsfn/svelte/Breadcrumbs.svelte";
  import Pagination from "@docsfn/svelte/Pagination.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<svelte:head>
  <title>{data.surface.title ?? data.siteTitle}</title>
  {#if data.surface.description}
    <meta name="description" content={data.surface.description} />
  {/if}
</svelte:head>

<DocsLayout surface={data.surface} sidebar={data.sidebar}>
  <Breadcrumbs surface={data.surface} />
  {#if data.routeEntry.kind === "page" && data.compiled}
    <article class="docs-page-article">
      <h1 class="docs-page-title">{data.surface.title}</h1>
      <DocsContent compiled={data.compiled} />
    </article>
  {:else if data.routeEntry.kind === "api"}
    <article class="docs-page-article">
      <ApiReferenceRenderer api={data.routeEntry.api} />
    </article>
  {/if}
  <Pagination surface={data.surface} />
</DocsLayout>

<style>
  .docs-page-title {
    margin: 0.5rem 0 1rem;
    font-size: clamp(1.75rem, 3vw, 2.25rem);
    line-height: 1.2;
  }

  .docs-page-article {
    margin-top: 0.5rem;
  }
</style>
