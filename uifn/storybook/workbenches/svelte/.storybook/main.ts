import { svelte } from '@sveltejs/vite-plugin-svelte';

const config = {
  stories: ['../stories/**/*.stories.ts'],
  addons: ['@uifn/storybook', '@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: { name: '@storybook/svelte-vite', options: { docgen: false } },
  core: { disableTelemetry: true },
  async viteFinal(existing: { plugins?: unknown[] }) {
    return { ...existing, plugins: [...(existing.plugins ?? []), svelte()] };
  },
};

export default config;
