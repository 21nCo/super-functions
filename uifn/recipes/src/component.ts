export type ComponentRecipeVariant = 'default' | 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'danger-outline' | 'destructive' | 'success' | 'link';
export type ComponentRecipeSize = 'sm' | 'md' | 'lg' | 'icon-sm' | 'icon-md' | 'icon-lg' | number;
export type ComponentRecipeDensity = 'compact' | 'comfortable' | 'spacious';
export type ComponentRecipeStyle = Record<string, string | number | undefined>;
export type ComponentRecipeClasses = Readonly<Record<string, string | undefined>>;
export type ComponentRecipeStyles = Readonly<Record<string, ComponentRecipeStyle | undefined>>;

/** Styling props consumed by generated framework wrappers without catalog metadata. */
export interface ComponentRecipeProps {
  variant?: ComponentRecipeVariant;
  size?: ComponentRecipeSize;
  density?: ComponentRecipeDensity;
  unstyled?: boolean;
  classes?: ComponentRecipeClasses;
  styles?: ComponentRecipeStyles;
  style?: ComponentRecipeStyle;
}

export interface OpenComponentRecipeOptions extends ComponentRecipeProps {
  className?: string;
  vars?: Record<`--uifn-${string}`, string>;
  state?: string;
}

/** Framework-neutral recipe used by package wrappers and registry-installed source. */
export function openComponentPartRecipe(component: string, part: string, options: OpenComponentRecipeOptions = {}) {
  const namedSize = typeof options.size === 'string' ? options.size : undefined;
  const publicClasses = options.unstyled
    ? []
    : [
        `uifn-${component}`,
        `uifn-${component}__${part}`,
        part === 'root' && options.variant ? `uifn-${component}--${options.variant}` : undefined,
        part === 'root' && namedSize ? `uifn-${component}--${namedSize}` : undefined,
        part === 'root' && options.density ? `uifn-${component}--density-${options.density}` : undefined,
      ];
  const className = [...publicClasses, options.classes?.[part], options.className].filter(Boolean).join(' ');
  const style = {
    ...(options.styles?.[part] ?? {}),
    ...(options.style ?? {}),
    ...(options.vars ?? {}),
  };
  return {
    className,
    style,
    vars: { ...(options.vars ?? {}) },
    data: {
      'data-uifn-component': component,
      'data-uifn-part': part,
      ...(options.state ? { 'data-state': options.state } : {}),
      ...(options.density ? { 'data-uifn-density': options.density } : {}),
      ...(options.variant ? { 'data-uifn-variant': options.variant } : {}),
      ...(options.size ? { 'data-uifn-size': options.size } : {}),
      ...(options.unstyled ? { 'data-uifn-unstyled': 'true' } : {}),
    },
    selector: `[data-uifn-component="${component}"][data-uifn-part="${part}"]`,
  } as const;
}
