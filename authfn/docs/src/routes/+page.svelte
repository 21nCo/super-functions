<script lang="ts">
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const tagline = "Self-hosted authentication for any stack.";
  const configDescription = data.source.config.site.description ?? "";
  const extraBlurb = configDescription && configDescription !== tagline ? configDescription : "";

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

<svelte:head>
  <title>{data.source.siteTitle}</title>
  <meta name="description" content={data.source.config.site.description ?? tagline} />
</svelte:head>

<div class="landing docsfn-layout">
  <section class="landing-hero" aria-labelledby="landing-title">
    <p class="landing-eyebrow">Open source</p>
    <h1 id="landing-title" class="landing-title">authfn</h1>
    <p class="landing-tagline">{tagline}</p>
    {#if extraBlurb}
      <p class="landing-sub">{extraBlurb}</p>
    {/if}
  </section>

  <section class="landing-features" aria-label="Highlights">
    <ul class="landing-feature-grid">
      {#each features as item (item.title)}
        <li class="landing-feature">
          <h2 class="landing-feature-title">{item.title}</h2>
          <p class="landing-feature-text">{item.text}</p>
        </li>
      {/each}
    </ul>
  </section>

  <section class="landing-links" aria-label="Quick links">
    <h2 class="landing-section-heading">Explore</h2>
    <div class="landing-cards">
      {#each quickLinks as link (link.href)}
        <a class="landing-card" href={link.href}>
          <span class="landing-card-label">{link.label}</span>
          <p class="landing-card-blurb">{link.blurb}</p>
          <span class="landing-card-cta" aria-hidden="true">→</span>
        </a>
      {/each}
    </div>
  </section>
</div>

<style>
  .landing {
    padding-block: clamp(2.5rem, 6vw, 4.5rem);
  }

  .landing-hero {
    text-align: center;
    margin-bottom: clamp(2rem, 5vw, 3.5rem);
    padding: clamp(1.5rem, 4vw, 2.5rem);
    border-radius: 1rem;
    background: linear-gradient(
      160deg,
      var(--docsfn-color-accent-soft) 0%,
      transparent 55%
    );
    border: 1px solid var(--docsfn-color-border);
    transition: var(--docsfn-transition-theme);
  }

  .landing-eyebrow {
    margin: 0 0 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--docsfn-color-primary);
  }

  .landing-title {
    margin: 0;
    font-size: clamp(2.5rem, 6vw, 3.5rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--docsfn-color-fg);
    line-height: 1.05;
  }

  .landing-tagline {
    margin: 1rem auto 0;
    max-width: 32rem;
    font-size: clamp(1.05rem, 2.5vw, 1.25rem);
    line-height: 1.5;
    font-weight: 500;
    color: var(--docsfn-color-fg);
  }

  .landing-sub {
    margin: 0.75rem auto 0;
    max-width: 36rem;
    font-size: 0.95rem;
    line-height: 1.6;
    color: var(--docsfn-color-muted);
  }

  .landing-features {
    margin-bottom: clamp(2rem, 5vw, 3rem);
  }

  .landing-feature-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  }

  .landing-feature {
    margin: 0;
    padding: 1.1rem 1.25rem;
    border-radius: 0.75rem;
    border: 1px solid var(--docsfn-color-border);
    background: var(--docsfn-color-surface);
    transition: var(--docsfn-transition-theme);
  }

  .landing-feature-title {
    margin: 0 0 0.4rem;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--docsfn-color-fg);
  }

  .landing-feature-text {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.55;
    color: var(--docsfn-color-muted);
  }

  .landing-links {
    margin-top: 0.5rem;
  }

  .landing-section-heading {
    margin: 0 0 1rem;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--docsfn-color-muted);
  }

  .landing-cards {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  }

  .landing-card {
    position: relative;
    display: block;
    padding: 1.35rem 1.5rem 1.5rem;
    border-radius: 0.75rem;
    border: 1px solid var(--docsfn-color-border);
    background: var(--docsfn-color-surface);
    text-decoration: none;
    color: inherit;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease,
      transform 0.15s ease;
  }

  .landing-card:hover {
    border-color: var(--docsfn-color-primary);
    box-shadow: 0 8px 28px rgb(37 99 235 / 0.12);
    transform: translateY(-1px);
  }

  @media (prefers-color-scheme: dark) {
    .landing-card:hover {
      box-shadow: 0 8px 28px rgb(0 0 0 / 0.35);
    }
  }

  .landing-card-label {
    display: block;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--docsfn-color-fg);
  }

  .landing-card-blurb {
    margin: 0.45rem 0 0;
    font-size: 0.875rem;
    line-height: 1.5;
    color: var(--docsfn-color-muted);
  }

  .landing-card-cta {
    position: absolute;
    top: 1.25rem;
    right: 1.25rem;
    font-size: 1.1rem;
    color: var(--docsfn-color-primary);
    opacity: 0.7;
  }

  .landing-card:hover .landing-card-cta {
    opacity: 1;
  }
</style>
