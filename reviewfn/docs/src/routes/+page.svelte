<script lang="ts">
  import LandingPage from "../../../../scripts/docs-site/LandingPage.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tagline = "Evidence-backed advisory reviews for pull requests.";

  const features = [
    { title: "Immutable review scope", text: "Capture exact base and head commits with frozen context." },
    { title: "Isolated execution", text: "Run approved tests and inference in bounded containers." },
    { title: "Validated reports", text: "Check every assessment, finding, and evidence reference." },
    { title: "Advisory publication", text: "Publish one current-head GitHub summary and neutral check." },
  ];

  const quickLinks = [
    { label: "Get started", href: "/docs/getting-started", blurb: "Install the CLI and run a local review." },
    { label: "Review workflow", href: "/docs/workflow", blurb: "Understand snapshots, context, tests, and inference." },
    { label: "Security", href: "/docs/security", blurb: "See the trust boundary and isolation requirements." },
    { label: "Reference", href: "/docs/reference", blurb: "Configuration, reports, GitHub, and evaluation." },
  ];
</script>

<LandingPage name="ReviewFn" siteTitle={data.source.siteTitle} description={data.source.config.site.description} {tagline} {features} {quickLinks} />
