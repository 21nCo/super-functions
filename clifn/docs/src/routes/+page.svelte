<script lang="ts">
  import LandingPage from "../../../../scripts/docs-site/LandingPage.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tagline = "Build reliable command-line tools from reusable primitives.";

  const features = [
    { title: "Parser agnostic", text: "Keep your CLI's command graph while sharing execution and output behavior across parsers." },
    { title: "Predictable output", text: "Choose text or JSON, quiet or verbose mode, and deterministic tables and diagnostics." },
    { title: "Safe local state", text: "Load configuration, environment values, and credentials with explicit failure modes." },
    { title: "Automation primitives", text: "Run subprocesses, scaffold files, and compose non-interactive actions." },
  ];

  const docsBasePath = $derived(data.source.config.site.basePath ?? "/docs");
  const quickLinks = $derived([
    { label: "Get started", href: `${docsBasePath}/getting-started`, blurb: "Install the package and run your first action." },
    { label: "CLI builder", href: `${docsBasePath}/cli-builder`, blurb: "Runner, output, diagnostics, and parser integration." },
    { label: "Configuration", href: `${docsBasePath}/configuration`, blurb: "Config files, environment values, and credentials." },
    { label: "API reference", href: `${docsBasePath}/reference`, blurb: "Every public subpath and its contracts." },
  ]);
</script>

<LandingPage name="CliFn" siteTitle={data.source.siteTitle} description={data.source.config.site.description} {tagline} {features} {quickLinks} />
