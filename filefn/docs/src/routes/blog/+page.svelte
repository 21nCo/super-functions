<script lang="ts">
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<svelte:head>
  <title>Blog — {data.source.siteTitle}</title>
</svelte:head>

<div class="blog-list docsfn-layout">
  <header class="blog-list-header">
    <h1>Blog</h1>
    <p class="blog-list-intro">Release notes and announcements.</p>
  </header>

  {#if data.posts.length === 0}
    <p class="blog-list-empty">No posts yet.</p>
  {:else}
    <ul class="blog-list-items">
      {#each data.posts as post (post.id)}
        <li>
          <a class="blog-list-card" href="/blog/{post.slug}">
            <span class="blog-list-title">{post.title}</span>
            <time class="blog-list-date" datetime={post.date}>{post.date}</time>
            {#if post.excerpt ?? post.summary}
              <p class="blog-list-excerpt">{post.excerpt ?? post.summary}</p>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .blog-list {
    padding-block: 2rem 3rem;
  }

  .blog-list-header h1 {
    margin: 0 0 0.5rem;
    font-size: 2rem;
    color: var(--docsfn-color-fg, #0f172a);
  }

  .blog-list-intro {
    margin: 0;
    color: var(--docsfn-color-muted, #64748b);
  }

  .blog-list-empty {
    margin-top: 2rem;
    color: var(--docsfn-color-muted, #64748b);
  }

  .blog-list-items {
    list-style: none;
    margin: 2rem 0 0;
    padding: 0;
    display: grid;
    gap: 1rem;
  }

  .blog-list-card {
    display: grid;
    gap: 0.35rem;
    padding: 1rem 1.25rem;
    border-radius: 0.75rem;
    border: 1px solid var(--docsfn-color-border, #e2e8f0);
    text-decoration: none;
    color: inherit;
    background: var(--docsfn-color-surface, #fff);
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .blog-list-card:hover {
    border-color: var(--docsfn-color-primary, #2563eb);
    box-shadow: 0 2px 12px rgb(37 99 235 / 0.1);
  }

  .blog-list-title {
    font-weight: 600;
    font-size: 1.05rem;
    color: var(--docsfn-color-fg, #0f172a);
  }

  .blog-list-date {
    font-size: 0.8rem;
    color: var(--docsfn-color-muted, #64748b);
  }

  .blog-list-excerpt {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--docsfn-color-muted, #64748b);
  }
</style>
