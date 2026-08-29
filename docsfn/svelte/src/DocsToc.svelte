<script lang="ts">
  import { onMount } from "svelte";
  import type { DocHeading } from "@docsfn/core/browser";
  import type { DocsPageSurface } from "./DocsLayout.svelte";

  export let surface: DocsPageSurface | undefined = undefined;
  export let headings: DocHeading[] | undefined = undefined;
  export let activeHash: string | undefined = undefined;

  let currentHash = activeHash || "";

  $: resolvedHeadings = headings ?? surface?.headings ?? [];

  // Auto-detect active heading based on scroll position
  onMount(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    if (activeHash !== undefined) {
      currentHash = activeHash;
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('id');
            if (id) {
              currentHash = `#${id}`;
              break; // first (topmost) intersecting heading wins
            }
          }
        }
      },
      {
        rootMargin: '-80px 0px -80% 0px',
        threshold: 0,
      }
    );

    resolvedHeadings.forEach((h: DocHeading) => {
      const element = document.getElementById(h.slug);
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      observer.disconnect();
    };
  });

  function handleClick(e: MouseEvent, slug: string) {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    e.preventDefault();
    const element = document.getElementById(slug);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      currentHash = `#${slug}`;
      // Update URL without triggering navigation
      window.history.replaceState(null, "", `#${slug}`);
    }
  }
</script>

{#if resolvedHeadings.length > 0}
  <div class="docsfn-toc">
    <div class="docsfn-toc-viewport">
      <nav class="docsfn-toc-nav" aria-label="Table of contents">
        <div class="docsfn-toc-title">On this page</div>
        <ul class="docsfn-toc-list">
          {#each resolvedHeadings as h, i (h.slug)}
            {@const isActive = currentHash === `#${h.slug}` || (!currentHash && i === 0)}
            <li
              class="docsfn-toc-item"
              data-level={h.level}
              style="padding-left: {(h.level - 1) * 12}px"
            >
              <a
                href="#{h.slug}"
                on:click={(e) => handleClick(e, h.slug)}
                class="docsfn-toc-link {isActive ? 'active' : ''}"
                data-active={isActive}
                aria-current={isActive ? "location" : undefined}
              >
                {h.text}
              </a>
            </li>
          {/each}
        </ul>
      </nav>
    </div>
  </div>
{/if}
