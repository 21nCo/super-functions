import type { DesignToken, TokenTree } from '@uifn/tokens';

function token($type: DesignToken['$type'], $value: DesignToken['$value']): DesignToken {
  return { $type, $value };
}

/** Shared non-color foundations used by every first-party and generated brand theme. */
export function createFoundationalTokens(): TokenTree {
  return {
    typography: {
      family: {
        sans: token('fontFamily', 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'),
        mono: token('fontFamily', '"SFMono-Regular", Consolas, "Liberation Mono", monospace'),
      },
      size: {
        xs: token('dimension', '0.75rem'),
        sm: token('dimension', '0.8125rem'),
        md: token('dimension', '0.875rem'),
        lg: token('dimension', '1rem'),
        xl: token('dimension', '1.125rem'),
      },
      lineHeight: {
        tight: token('number', 1.2),
        normal: token('number', 1.45),
        relaxed: token('number', 1.65),
      },
      weight: {
        regular: token('number', 400),
        medium: token('number', 500),
        semibold: token('number', 650),
        bold: token('number', 700),
      },
    },
    space: {
      1: token('dimension', '0.25rem'),
      2: token('dimension', '0.5rem'),
      3: token('dimension', '0.75rem'),
      4: token('dimension', '1rem'),
      5: token('dimension', '1.25rem'),
      6: token('dimension', '1.5rem'),
      8: token('dimension', '2rem'),
      12: token('dimension', '3rem'),
    },
    control: {
      size: {
        sm: token('dimension', '2rem'),
        md: token('dimension', '2.5rem'),
        lg: token('dimension', '3rem'),
      },
      gap: {
        sm: token('dimension', '0.375rem'),
        md: token('dimension', '0.5rem'),
        lg: token('dimension', '0.75rem'),
      },
    },
    border: {
      width: {
        hairline: token('dimension', '0.5px'),
        default: token('dimension', '1px'),
        strong: token('dimension', '2px'),
      },
    },
    elevation: {
      shadow: {
        sm: token('shadow', '0 1px 2px rgb(15 23 42 / 8%)'),
        md: token('shadow', '0 8px 24px rgb(15 23 42 / 10%)'),
        lg: token('shadow', '0 18px 48px rgb(15 23 42 / 16%)'),
        overlay: token('shadow', '0 28px 90px rgb(15 23 42 / 24%)'),
      },
    },
    icon: {
      size: {
        sm: token('dimension', '0.875rem'),
        md: token('dimension', '1rem'),
        lg: token('dimension', '1.25rem'),
      },
      stroke: {
        regular: token('number', 1.75),
        strong: token('number', 2.25),
      },
    },
  };
}
