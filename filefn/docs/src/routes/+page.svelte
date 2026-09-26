<script lang="ts">
  import LandingPage from "../../../../scripts/docs-site/LandingPage.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tagline = "Self-hosted file uploads, storage, and processing.";

  const features = [
    {
      title: "Resumable uploads",
      text: "Multipart uploads with signed URLs, idempotency, OPFS offline staging, and HEIC preprocessing — out of the box.",
    },
    {
      title: "Pluggable storage",
      text: "S3, GCS, Azure, Cloudflare R2, MinIO, or your own filesystem — swap adapters without touching app code.",
    },
    {
      title: "Built-in processing",
      text: "Thumbnails, PDF previews, OCR, image transforms, audio waveforms, and video posters — composable processors with stable artifacts.",
    },
    {
      title: "Type-safe SDKs",
      text: "TypeScript server and client, Python kernel, native Swift package, and a framework-agnostic viewer renderer.",
    },
  ];

  const quickLinks = [
    { label: "Getting Started", href: "/docs/getting-started", blurb: "Mount filefn on Hono and upload your first file." },
    { label: "Core Concepts", href: "/docs/core-concepts", blurb: "Upload sessions, policies, render intents, and offline mode." },
    { label: "API Reference", href: "/docs/api", blurb: "Canonical OpenAPI surface for the FileFn HTTP contract." },
    { label: "Recipes", href: "/docs/recipes", blurb: "Image uploads, share links, virus scanning, CDN integration." },
  ];
</script>

<LandingPage name="filefn" siteTitle={data.source.siteTitle} description={data.source.config.site.description} {tagline} {features} {quickLinks} />
