const config = {
  stories: ['../stories/**/*.stories.tsx'],
  addons: ['@uifn/storybook', '@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: { name: '@storybook/react-vite', options: {} },
  core: { disableTelemetry: true },
};

export default config;
