import { mountSvelteContent } from '@superfunctions/extfn-svelte';

import YoutubeBadge from './YoutubeBadge.svelte';

for (const [index, anchor] of Array.from(
  document.querySelectorAll<HTMLElement>('[data-extfn-youtube-anchor]')
).entries()) {
  const host = document.createElement('div');
  anchor.append(host);

  mountSvelteContent(YoutubeBadge, host, {
    props: {
      label: `YouTube anchor ${index + 1}`,
    },
  });
}
