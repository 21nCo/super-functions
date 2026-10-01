<script lang="ts">
  import LandingPage from "../../../../scripts/docs-site/LandingPage.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tagline = "Scoped, revisioned memory for applications and agents.";

  const features = [
    { title: "Explicit scope", text: "Every operation requires a trusted tenant and container tags." },
    { title: "Revisioned lifecycle", text: "Compare revisions when updating and retain tombstones when forgetting." },
    { title: "Semantic retrieval", text: "Search by embedding with a configured provider and scoped storage adapter." },
    { title: "Host-controlled access", text: "HTTP and MCP entry points require host-supplied authorization boundaries." },
  ];

  const quickLinks = [
    { label: "Get started", href: "/docs/getting-started", blurb: "Create a process-local memory and choose durable storage." },
    { label: "Scope and lifecycle", href: "/docs/scope-and-lifecycle", blurb: "Tenants, tags, revisions, updates, and forgetting." },
    { label: "Storage", href: "/docs/storage", blurb: "PostgreSQL migrations, adapters, and ownership." },
    { label: "Reference", href: "/docs/reference", blurb: "Public API types and source-aligned package guidance." },
  ];
</script>

<LandingPage name="MemoryFn" siteTitle={data.source.siteTitle} description={data.source.config.site.description} {tagline} {features} {quickLinks} />
