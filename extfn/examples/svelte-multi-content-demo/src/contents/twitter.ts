import { mountSvelteContent } from '@superfunctions/extfn-svelte';

import TwitterBadge from './TwitterBadge.svelte';

for (const [index, anchor] of Array.from(
  document.querySelectorAll<HTMLElement>('[data-extfn-twitter-anchor]')
).entries()) {
  const host = document.createElement('div');
  const shadowRoot = host.attachShadow({ mode: 'open' });
  anchor.append(host);

  mountSvelteContent(TwitterBadge, shadowRoot, {
    props: {
      label: `Twitter anchor ${index + 1}`,
    },
  });
}
