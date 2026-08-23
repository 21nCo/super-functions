const config = {
  stories: ['../stories/**/*.stories.tsx'],
  addons: ['@uifn/storybook', '@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: { name: 'storybook-solidjs-vite', options: {} },
  core: { disableTelemetry: true },
};

export default config;
