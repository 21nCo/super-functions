<script lang="ts">
  import LandingPage from "../../../../scripts/docs-site/LandingPage.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tagline = "Bot integrations and operator controls for Discord and Slack.";

  const features = [
    { title: "Discord commands", text: "Link or create GitHub and Linear issues from signed interactions." },
    { title: "Slack receiver", text: "Verify Slack event requests and answer URL challenges." },
    { title: "Issue persistence", text: "Store issue and Discord thread relationships in PostgreSQL." },
    { title: "Operator capability", text: "Manage scoped bots and verified channel bindings through Super Console." },
  ];

  const quickLinks = [
    { label: "Get started", href: "/docs/getting-started", blurb: "Choose a Worker or shared integration package." },
    { label: "Discord bot", href: "/docs/discord-bot", blurb: "Configure signed interactions and issue commands." },
    { label: "Persistence", href: "/docs/persistence", blurb: "Provision PostgreSQL and use the tRPC service." },
    { label: "Reference", href: "/docs/reference", blurb: "Packages, commands, routes, and configuration." },
  ];
</script>

<LandingPage name="BotFn" siteTitle={data.source.siteTitle} description={data.source.config.site.description} {tagline} {features} {quickLinks} />
