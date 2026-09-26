<script lang="ts">
  import LandingPage from "../../../../scripts/docs-site/LandingPage.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tagline = "A shared integration runtime for products.";

  const features = [
    { title: "Provider registry", text: "Register providers through one integration contract." },
    { title: "Connection lifecycle", text: "Manage OAuth and owned provider connections." },
    { title: "Verified webhooks", text: "Process provider events through guarded routes." },
    { title: "Workflow execution", text: "Run actions, workflows, and durable sync jobs." },
  ];

  const quickLinks = [
    { label: "Get started", href: "/docs/getting-started", blurb: "Configure the runtime and mount its routes." },
    { label: "Provider readiness", href: "/docs/provider-readiness", blurb: "Check the matrix before adopting a provider." },
    { label: "Security", href: "/docs/security-boundaries", blurb: "Keep credentials and token exchange server-side." },
    { label: "Reference", href: "/docs/reference", blurb: "Source contracts and release conditions." },
  ];
</script>

<LandingPage name="PlugFn" siteTitle={data.source.siteTitle} description={data.source.config.site.description} {tagline} {features} {quickLinks} />
