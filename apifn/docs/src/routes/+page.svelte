<script lang="ts">
  import LandingPage from "../../../../scripts/docs-site/LandingPage.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tagline = "Code-first API design, testing, and documentation.";

  const features = [
    { title: "OpenAPI from code", text: "Generate OpenAPI 3.1 from a typed router." },
    { title: "Portable collections", text: "Run API request suites with assertions and reporters." },
    { title: "Diff and validate", text: "Catch breaking API changes before release." },
    { title: "Interactive reference", text: "Explore operations and try requests in a UI." },
  ];

  const quickLinks = [
    { label: "Get started", href: "/docs/getting-started", blurb: "Generate a spec from a router and validate it." },
    { label: "Collections and tests", href: "/docs/collections-and-tests", blurb: "Exercise requests and assert responses." },
    { label: "Mocking", href: "/docs/mocking", blurb: "Serve realistic responses from a spec." },
    { label: "Reference", href: "/docs/reference", blurb: "Package guides and complete CLI reference." },
  ];
</script>

<LandingPage name="ApiFn" siteTitle={data.source.siteTitle} description={data.source.config.site.description} {tagline} {features} {quickLinks} />
