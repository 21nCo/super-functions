export type SemanticSurface = 'canvas' | 'raised' | 'sunken' | 'overlay';
export type SurfaceHoverEffect = 'tint' | 'stripe' | 'border' | 'lift' | 'none';

export interface RecipeOutput {
  className: string;
  style: Record<string, string | number>;
  vars: Record<`--uifn-${string}`, string>;
  data: Record<string, string | number | boolean>;
}

export type RecipeErrorCode = 'UIFN_SURFACE_DEPTH_OUT_OF_RANGE' | 'UIFN_RECIPE_UNKNOWN_VARIANT';

export class UIFnRecipeError extends Error {
  readonly name = 'UIFnRecipeError';
  readonly code: RecipeErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: RecipeErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.code = code;
    this.details = details;
  }
}

export interface SurfaceOptions {
  surface?: SemanticSurface;
  depth?: number;
}

export interface SurfaceHoverOptions extends SurfaceOptions {
  effect?: SurfaceHoverEffect;
}

const MAX_SURFACE_DEPTH = 4;
const SEMANTIC_SURFACES = new Set<SemanticSurface>(['canvas', 'raised', 'sunken', 'overlay']);
const HOVER_EFFECTS = new Set<SurfaceHoverEffect>(['tint', 'stripe', 'border', 'lift', 'none']);
const STATIC_SURFACE_CLASSES = {
  tint: 'uifn-hover--tint',
  stripe: 'uifn-hover--stripe',
  border: 'uifn-hover--border',
  lift: 'uifn-hover--lift',
  none: 'uifn-hover--none',
} satisfies Record<SurfaceHoverEffect, string>;

function assertDepth(depth: number): void {
  if (!Number.isInteger(depth) || depth < 0 || depth > MAX_SURFACE_DEPTH) {
    throw new UIFnRecipeError('UIFN_SURFACE_DEPTH_OUT_OF_RANGE', 'Surface depth is outside the supported range.', {
      depth,
      min: 0,
      max: MAX_SURFACE_DEPTH,
    });
  }
}

function assertSurface(surface: SemanticSurface): void {
  if (!SEMANTIC_SURFACES.has(surface)) {
    throw new UIFnRecipeError('UIFN_RECIPE_UNKNOWN_VARIANT', 'Unknown semantic surface.', {
      surface,
    });
  }
}

function assertHoverEffect(effect: SurfaceHoverEffect): void {
  if (!HOVER_EFFECTS.has(effect)) {
    throw new UIFnRecipeError('UIFN_RECIPE_UNKNOWN_VARIANT', 'Unknown surface hover effect.', {
      effect,
    });
  }
}

function surfaceVar(options: SurfaceOptions): string {
  if (options.depth !== undefined) {
    assertDepth(options.depth);
    return `var(--uifn-color-surface-depth-${options.depth})`;
  }

  const nextSurface = options.surface ?? 'canvas';
  assertSurface(nextSurface);
  return `var(--uifn-color-surface-${nextSurface})`;
}

export function surface(options: SemanticSurface | SurfaceOptions = 'canvas'): RecipeOutput {
  const normalized = typeof options === 'string' ? { surface: options } : options;
  const value = surfaceVar(normalized);

  return {
    className: 'uifn-surface',
    style: {},
    vars: {
      '--uifn-surface': value,
    },
    data: {
      surface: normalized.surface ?? 'depth',
      ...(normalized.depth !== undefined ? { depth: normalized.depth } : {}),
    },
  };
}

export function surfaceHover(options: SurfaceHoverOptions = {}): RecipeOutput {
  const effect = options.effect ?? 'tint';
  assertHoverEffect(effect);
  const base = surface(options);

  return {
    ...base,
    className: `${base.className} ${STATIC_SURFACE_CLASSES[effect]}`,
    vars: {
      ...base.vars,
      '--uifn-surface-hover': effect === 'none' ? 'transparent' : base.vars['--uifn-surface'],
    },
    data: {
      ...base.data,
      hoverEffect: effect,
    },
  };
}
