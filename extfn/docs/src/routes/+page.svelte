<script lang="ts">
  import LandingPage from "../../../../scripts/docs-site/LandingPage.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tagline = "Build browser extensions from one code-first config.";

  const features = [
    { title: "Multi-target builds", text: "Build Chromium and Firefox MV3 outputs from one config." },
    { title: "Runtime helpers", text: "Use Promise-first browser APIs, messaging, events, and ports." },
    { title: "Content surfaces", text: "Mount multiple content scripts and Svelte components." },
    { title: "Release workflow", text: "Scan built outputs and package store-uploadable archives." },
  ];

  const quickLinks = [
    { label: "Get started", href: "/docs/getting-started", blurb: "Create a config and build your first extension." },
    { label: "Runtime", href: "/docs/runtime", blurb: "Use browser access, messaging, and capabilities." },
    { label: "CLI workflow", href: "/docs/cli", blurb: "Develop, build, scan, and package targets." },
    { label: "Reference", href: "/docs/reference", blurb: "Package map and source-aligned reference guides." },
  ];
</script>

<LandingPage name="ExtFn" siteTitle={data.source.siteTitle} description={data.source.config.site.description} {tagline} {features} {quickLinks} />
