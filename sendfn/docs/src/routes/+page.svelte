<script lang="ts">
  import LandingPage from "../../../../scripts/docs-site/LandingPage.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tagline = "One SDK for product communications.";

  const features = [
    { title: "Email delivery", text: "Send messages and record transactions through adapters." },
    { title: "Multiple channels", text: "Use email, SMS, WhatsApp, and push in one API." },
    { title: "Events and suppressions", text: "Process bounces, complaints, and delivery events." },
    { title: "Provider choice", text: "Inject the provider and database adapters you operate." },
  ];

  const quickLinks = [
    { label: "Get started", href: "/docs/getting-started", blurb: "Configure a database and send your first message." },
    { label: "Provider setup", href: "/docs/providers", blurb: "Configure delivery providers and credentials." },
    { label: "Webhooks", href: "/docs/webhooks", blurb: "Verify SES lifecycle notifications safely." },
    { label: "Reference", href: "/docs/reference", blurb: "TypeScript and Python package guides." },
  ];
</script>

<LandingPage name="SendFn" siteTitle={data.source.siteTitle} description={data.source.config.site.description} {tagline} {features} {quickLinks} />
