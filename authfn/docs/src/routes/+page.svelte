<script lang="ts">
  import LandingPage from "../../../../scripts/docs-site/LandingPage.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tagline = "Self-hosted authentication for any stack.";

  const features = [
    {
      title: "Multiple sign-in methods",
      text: "Email/password, one-time passwords, and social OAuth (Google, GitHub, and more) — opt in to what you need.",
    },
    {
      title: "Session management",
      text: "Cookie- and token-based sessions with rotation, revocation, and multi-region replication built in.",
    },
    {
      title: "Pluggable adapters",
      text: "Bring your own database, mail, and OAuth providers — swap implementations without touching app code.",
    },
    {
      title: "Type-safe SDKs",
      text: "TypeScript and Python clients generated from the same core, with framework adapters for Svelte and more.",
    },
  ];

  const quickLinks = [
    { label: "Getting Started", href: "/docs/getting-started", blurb: "Install, configure, and sign in your first user." },
    { label: "Core Concepts", href: "/docs/core-concepts", blurb: "Sessions, plugins, regions, and the auth lifecycle." },
    { label: "API Reference", href: "/docs/api", blurb: "Package-level API documentation." },
    { label: "Blog", href: "/blog", blurb: "Release notes and announcements." },
  ];
</script>

<LandingPage name="authfn" siteTitle={data.source.siteTitle} description={data.source.config.site.description} {tagline} {features} {quickLinks} />
