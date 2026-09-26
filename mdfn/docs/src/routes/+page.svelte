<script lang="ts">
  import LandingPage from "../../../../scripts/docs-site/LandingPage.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tagline = "Markdown is the durable document boundary.";

  const features = [
    { title: "Source preservation", text: "Keep untouched Markdown bytes and preserve unknown syntax." },
    { title: "Shared controller", text: "Use one document model across browser frameworks." },
    { title: "Safe rendering", text: "Render with explicit raw HTML and URL policies." },
    { title: "Durable workflows", text: "Persist versions, review sidecars, and collaboration updates." },
  ];

  const quickLinks = [
    { label: "Get started", href: "/docs/getting-started", blurb: "Create a controller from Markdown." },
    { label: "Framework editors", href: "/docs/framework-editors", blurb: "Mount React, Svelte, Solid, or vanilla DOM editors." },
    { label: "Server", href: "/docs/server-and-storage", blurb: "Persist documents, versions, and review sidecars." },
    { label: "Reference", href: "/docs/reference", blurb: "Package graph and source guides." },
  ];
</script>

<LandingPage name="MDFN" siteTitle={data.source.siteTitle} description={data.source.config.site.description} {tagline} {features} {quickLinks} />
