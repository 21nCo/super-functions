<script lang="ts">
  import LandingPage from "../../../../scripts/docs-site/LandingPage.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tagline = "Build and test Model Context Protocol servers with stable contracts.";

  const features = [
    { title: "Validated server contracts", text: "Declare tools, resources, prompts, tasks, and client requirements with deterministic manifests." },
    { title: "Production clients", text: "Connect over stdio or Streamable HTTP with complete inventories and explicit OAuth completion." },
    { title: "Regression evidence", text: "Compare manifests and client profiles, run semantic scenarios, and check official conformance." },
    { title: "Bounded authorization", text: "Protect HTTP resources and compose hosted OAuth with your existing identity and token systems." },
  ];

  const quickLinks = [
    { label: "Get started", href: "/docs/getting-started", blurb: "Build and run a validated MCP server." },
    { label: "Server guide", href: "/docs/server", blurb: "Tools, resources, prompts, tasks, and trusted context." },
    { label: "Testing guide", href: "/docs/testing", blurb: "Contract, scenario, authentication, and conformance checks." },
    { label: "Package reference", href: "/docs/reference", blurb: "Public package entry points and detailed API examples." },
  ];
</script>

<LandingPage name="McpFn" siteTitle={data.source.siteTitle} description={data.source.config.site.description} {tagline} {features} {quickLinks} />
