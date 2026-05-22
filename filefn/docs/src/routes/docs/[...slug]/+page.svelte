<script lang="ts">
  import DocsContent from "@site/docs-content";
  import DocsLayout from "@site/docs-layout";
  import ApiReferenceRenderer from "@site/api-reference-renderer";
  import Breadcrumbs from "@site/breadcrumbs";
  import Pagination from "@site/pagination";
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
      <DocsContent compiled={data.compiled} />
    </article>
  {:else}
    <article class="docs-page-article">
      <ApiReferenceRenderer api={data.routeEntry.api} />
    </article>
  {/if}
  <Pagination surface={data.surface} />
</DocsLayout>

<style>
  .docs-page-article {
    margin-top: 0.5rem;
  }
</style>
