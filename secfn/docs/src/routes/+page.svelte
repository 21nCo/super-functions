<script lang="ts">
  import LandingPage from "../../../../scripts/docs-site/LandingPage.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tagline = "Secrets and security services for trusted applications.";

  const features = [
    { title: "Encrypted vault", text: "Store versioned secrets with AES-256-GCM and scoped access." },
    { title: "Runtime retrieval", text: "Resolve secrets and sets from trusted server processes." },
    { title: "Security scanner", text: "Detect secret patterns and export review reports." },
    { title: "Audit and limits", text: "Apply RBAC, rate limits, and durable security audit events." },
  ];

  const quickLinks = [
    { label: "Get started", href: "/docs/getting-started", blurb: "Choose core, server, and runtime packages." },
    { label: "Server", href: "/docs/server", blurb: "Mount authorized admin and runtime routes." },
    { label: "Runtime", href: "/docs/runtime", blurb: "Retrieve secrets in trusted processes." },
    { label: "Reference", href: "/docs/reference", blurb: "Package, route, and migration references." },
  ];
</script>

<LandingPage name="SecFn" siteTitle={data.source.siteTitle} description={data.source.config.site.description} {tagline} {features} {quickLinks} />
