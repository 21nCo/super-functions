<script lang="ts">
  import LandingPage from "../../../../scripts/docs-site/LandingPage.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tagline = "One trusted command contract for local development.";

  const features = [
    { title: "Trusted manifests", text: "Review and trust the exact manifest digest before lifecycle actions." },
    { title: "Native processes", text: "Run application processes with readiness, logs, and ownership checks." },
    { title: "Port leases", text: "Allocate machine-local ports with worktree identity." },
    { title: "Stable routes", text: "Expose concrete .localhost URLs through a shared Caddy registry." },
  ];

  const quickLinks = [
    { label: "Get started", href: "/docs/getting-started", blurb: "Initialize a manifest and start a local profile." },
    { label: "Configuration", href: "/docs/configuration", blurb: "Declare ports, processes, services, and profiles." },
    { label: "Lifecycle", href: "/docs/lifecycle", blurb: "Start, inspect, and stop owned resources." },
    { label: "Reference", href: "/docs/reference", blurb: "Package map, security, and migration references." },
  ];
</script>

<LandingPage name="DevFn" siteTitle={data.source.siteTitle} description={data.source.config.site.description} {tagline} {features} {quickLinks} />
