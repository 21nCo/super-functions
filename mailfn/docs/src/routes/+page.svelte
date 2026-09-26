<script lang="ts">
  import LandingPage from "../../../../scripts/docs-site/LandingPage.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tagline = "Programmable inboxes for products, tests, and agents.";

  const features = [
    { title: "Real inbound mail", text: "Accept MIME, persist raw evidence, and parse messages and attachments." },
    { title: "Scoped inboxes", text: "Create stable or expiring inboxes with one-time credentials." },
    { title: "Deterministic waits", text: "Wait for filtered messages and extract verification values." },
    { title: "Composable outbound", text: "Use SendFn for delivery without duplicating providers." },
  ];

  const quickLinks = [
    { label: "Get started", href: "/docs/getting-started", blurb: "Create an inbox and wait for a message." },
    { label: "Cloudflare runtime", href: "/docs/cloudflare-runtime", blurb: "Provision Email, D1, R2, Queues, and secrets." },
    { label: "Testing", href: "/docs/testing", blurb: "Use expiring fixtures and deterministic assertions." },
    { label: "Reference", href: "/docs/reference", blurb: "Package map, operations, and threat-model references." },
  ];
</script>

<LandingPage name="MailFn" siteTitle={data.source.siteTitle} description={data.source.config.site.description} {tagline} {features} {quickLinks} />
