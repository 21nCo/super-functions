<script lang="ts">
  import LandingPage from "../../../../scripts/docs-site/LandingPage.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tagline = "Compose model, tool, agent, and retrieval workflows.";

  const features = [
    { title: "Model adapters", text: "Use first-party OpenAI, Anthropic, Ollama, Google, and Mistral clients." },
    { title: "Workflow building blocks", text: "Combine prompts, tools, chains, graphs, agents, and RAG." },
    { title: "Observability", text: "Capture scoped traces, feedback, usage, and evaluation." },
    { title: "Protocol adapters", text: "Expose trusted HTTP and MCP surfaces." },
  ];

  const quickLinks = [
    { label: "Get started", href: "/docs/getting-started", blurb: "Create a TypeScript client and run a completion." },
    { label: "Providers", href: "/docs/models-and-providers", blurb: "Choose capabilities and streaming behavior." },
    { label: "Workflows", href: "/docs/workflows", blurb: "Build tools, graphs, agents, memory, and RAG." },
    { label: "Reference", href: "/docs/reference", blurb: "Compatibility and release contracts." },
  ];
</script>

<LandingPage name="LangFn" siteTitle={data.source.siteTitle} description={data.source.config.site.description} {tagline} {features} {quickLinks} />
