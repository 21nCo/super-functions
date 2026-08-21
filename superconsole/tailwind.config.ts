import { createTailwindPreset } from '@uifn/theme-tailwind';
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  presets: [createTailwindPreset()],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--uifn-typography-family-sans)'],
        mono: ['var(--uifn-typography-family-mono)'],
      },
      boxShadow: {
        console: 'var(--uifn-elevation-shadow-md)',
        overlay: 'var(--uifn-elevation-shadow-overlay)',
      },
      borderRadius: {
        console: 'var(--uifn-radius-lg)',
      },
    },
  },
} satisfies Config;
