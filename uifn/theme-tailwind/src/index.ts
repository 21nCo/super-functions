import { buttonTailwindClasses } from '@uifn/recipes';
import { PUBLIC_TOKEN_GROUPS } from '@uifn/tokens';

export type TailwindErrorCode = 'UIFN_TAILWIND_DYNAMIC_CLASS_UNSAFE';

export class UIFnTailwindError extends Error {
  readonly name = 'UIFnTailwindError';
  readonly code: TailwindErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: TailwindErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.code = code;
    this.details = details;
  }
}

export interface TailwindPresetOptions {
  themeSelectors?: string[];
}

export interface TailwindPresetOutput {
  theme: {
    extend: {
      colors: Record<string, string>;
    };
  };
  safelist: string[];
  plugins: UIFnTailwindPlugin[];
}

export interface TailwindPluginApi {
  addUtilities: (utilities: Record<string, Record<string, string>>) => void;
}

/**
 * Tailwind accepts plugin objects with a `handler` function. Keep the named
 * utility map on the object as public, inspectable metadata for build tools
 * and tests while also returning a preset Tailwind can execute directly.
 */
export interface UIFnTailwindPlugin {
  name: string;
  utilities: Record<string, Record<string, string>>;
  handler: (api: TailwindPluginApi) => void;
  config: Record<string, never>;
}

const UNSAFE_DYNAMIC_FRAGMENT_PATTERN = /\$\{|computed|`|\+|:\$\{|hover:\$\{|hover:\{|\[object Object\]/;
const BUTTON_VARIANTS = ['primary', 'secondary', 'ghost', 'danger'] as const;
const BUTTON_SIZES = ['sm', 'md', 'lg'] as const;
const HOVER_CLASSES = ['uifn-hover--tint', 'uifn-hover--stripe', 'uifn-hover--border', 'uifn-hover--lift', 'uifn-hover--none'] as const;

function createSemanticColorMap(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(PUBLIC_TOKEN_GROUPS.color).flatMap(([group, names]) =>
      names.map((name) => [`uifn-${group}-${name}`, `var(--uifn-color-${group}-${name})`])
    )
  );
}

function createUtilitiesPlugin(
  name: string,
  utilities: Record<string, Record<string, string>>
): UIFnTailwindPlugin {
  return {
    name,
    utilities,
    handler({ addUtilities }) {
      addUtilities(utilities);
    },
    config: {},
  };
}

export function assertSafeTailwindClassFragments(fragments: string[]): void {
  fragments.forEach((fragment) => {
    if (UNSAFE_DYNAMIC_FRAGMENT_PATTERN.test(fragment)) {
      throw new UIFnTailwindError(
        'UIFN_TAILWIND_DYNAMIC_CLASS_UNSAFE',
        'Tailwind class fragments must be statically discoverable.',
        {
          fragment,
        }
      );
    }
  });
}

export function createTailwindPreset(options: TailwindPresetOptions = {}): TailwindPresetOutput {
  const selectors = options.themeSelectors ?? [
    '[data-uifn-theme="uifn-light"]',
    '[data-uifn-theme="uifn-dark"]',
    '[data-uifn-theme="uifn-high-contrast-light"]',
    '[data-uifn-theme="uifn-high-contrast-dark"]',
  ];
  const button = buttonTailwindClasses({ variant: 'primary', hoverEffect: 'tint' });
  const safelist = [
    'uifn-button',
    ...BUTTON_VARIANTS.map((variant) => `uifn-button--${variant}`),
    ...BUTTON_SIZES.map((size) => `uifn-button--${size}`),
    ...HOVER_CLASSES,
    'uifn-surface',
  ];

  assertSafeTailwindClassFragments([...safelist, button.className]);

  return {
    theme: {
      extend: {
        colors: createSemanticColorMap(),
      },
    },
    safelist,
    plugins: [
      createUtilitiesPlugin('uifn-recipes', {
        '.uifn-surface': {
          color: 'var(--uifn-color-text-primary)',
          backgroundColor: 'var(--uifn-surface, var(--uifn-color-surface-canvas))',
        },
        '.uifn-button': {
          color: 'var(--uifn-button-foreground, var(--uifn-color-text-primary))',
          backgroundColor: 'var(--uifn-button-surface)',
          borderRadius: 'var(--uifn-button-radius, var(--uifn-radius-md))',
          transitionDuration: 'var(--uifn-motion-duration-fast)',
          transitionTimingFunction: 'var(--uifn-motion-easing-standard)',
        },
        '.uifn-button--primary': { '--uifn-button-surface': 'var(--uifn-color-accent-solid)' },
        '.uifn-button--secondary': { '--uifn-button-surface': 'var(--uifn-color-surface-raised)' },
        '.uifn-button--ghost': { '--uifn-button-surface': 'transparent' },
        '.uifn-button--danger': { '--uifn-button-surface': 'var(--uifn-color-danger-solid)' },
        '.uifn-button--sm': { '--uifn-button-density': 'var(--uifn-density-compact)' },
        '.uifn-button--md': { '--uifn-button-density': 'var(--uifn-density-comfortable)' },
        '.uifn-button--lg': { '--uifn-button-density': 'var(--uifn-density-spacious)' },
        '.uifn-hover--tint': { '--uifn-hover-effect': 'tint' },
        '.uifn-hover--stripe': { '--uifn-hover-effect': 'stripe' },
        '.uifn-hover--border': { '--uifn-hover-effect': 'border' },
        '.uifn-hover--lift': { '--uifn-hover-effect': 'lift' },
        '.uifn-hover--none': { '--uifn-hover-effect': 'none' },
      }),
      createUtilitiesPlugin(
        'uifn-theme-selectors',
        Object.fromEntries(selectors.map((selector) => [selector, {}]))
      ),
    ],
  };
}

export function buttonTailwindOutput() {
  const output = buttonTailwindClasses({ variant: 'primary', hoverEffect: 'tint' });
  assertSafeTailwindClassFragments([output.className]);
  return output;
}

export const themeTailwindPackage = {
  name: '@uifn/theme-tailwind',
  layer: 'styling',
  status: 'ga-candidate',
  sourcePolicy: 'clean-room',
} as const;
