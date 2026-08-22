import {
  CRYPTIC_PUBLIC_TOKEN_NAMES,
  PUBLIC_TOKEN_GROUPS,
  PUBLIC_TOKEN_TYPES,
  REQUIRED_PUBLIC_TOKEN_PATHS,
  UIFnTokenError,
  flattenTokens,
  isDesignToken,
  publicTokenName,
  type DesignToken,
  type DesignTokenTheme,
  type TokenTree,
  type TokenType,
  type TokenValidationResult,
} from './schema';
import { validateThemeContrast } from './oklch';

function assertAllowedPublicPath(path: string[]): void {
  const publicName = publicTokenName(path);
  const segments = publicName.split('.');

  if (segments.some((segment) => CRYPTIC_PUBLIC_TOKEN_NAMES.has(segment))) {
    throw new UIFnTokenError('UIFN_TOKEN_PUBLIC_NAME_INVALID', 'Public token names must be semantic.', {
      publicName,
    });
  }

  if (!(path[0] in PUBLIC_TOKEN_GROUPS)) {
    throw new UIFnTokenError('UIFN_TOKEN_GROUP_UNKNOWN', 'Unknown public token group.', {
      group: path[0],
      publicName,
    });
  }

  if (path[0] === 'color') {
    const group = path[1] as keyof typeof PUBLIC_TOKEN_GROUPS.color;
    const value = path[2];
    const allowed = PUBLIC_TOKEN_GROUPS.color[group];
    if (path.length !== 3 || !allowed || !allowed.includes(value as never)) {
      throw new UIFnTokenError('UIFN_TOKEN_PUBLIC_NAME_INVALID', 'Unknown semantic color token name.', {
        publicName,
      });
    }
    return;
  }

  if (path[0] === 'radius') {
    if (path.length !== 2 || !PUBLIC_TOKEN_GROUPS.radius.value.includes(path[1] as never)) {
      throw new UIFnTokenError('UIFN_TOKEN_PUBLIC_NAME_INVALID', 'Unknown semantic radius token name.', {
        publicName,
      });
    }
    return;
  }

  if (path[0] === 'space') {
    if (path.length !== 2 || !PUBLIC_TOKEN_GROUPS.space.value.includes(path[1] as never)) {
      throw new UIFnTokenError('UIFN_TOKEN_PUBLIC_NAME_INVALID', 'Unknown semantic spacing token name.', { publicName });
    }
    return;
  }

  if (path[0] === 'typography' || path[0] === 'control' || path[0] === 'border' || path[0] === 'elevation' || path[0] === 'icon') {
    const groupRecord = PUBLIC_TOKEN_GROUPS[path[0]] as Record<string, readonly string[]>;
    const allowed = groupRecord[path[1]];
    if (path.length !== 3 || !allowed?.includes(path[2])) {
      throw new UIFnTokenError('UIFN_TOKEN_PUBLIC_NAME_INVALID', 'Unknown semantic foundation token name.', { publicName });
    }
    return;
  }

  if (path[0] === 'density') {
    if (path.length !== 2 || !PUBLIC_TOKEN_GROUPS.density.value.includes(path[1] as never)) {
      throw new UIFnTokenError('UIFN_TOKEN_PUBLIC_NAME_INVALID', 'Unknown semantic density token name.', {
        publicName,
      });
    }
    return;
  }

  if (path[0] === 'motion') {
    const group = path[1] as keyof typeof PUBLIC_TOKEN_GROUPS.motion;
    const value = path[2];
    const allowed = PUBLIC_TOKEN_GROUPS.motion[group];
    if (path.length !== 3 || !allowed || !allowed.includes(value as never)) {
      throw new UIFnTokenError('UIFN_TOKEN_PUBLIC_NAME_INVALID', 'Unknown semantic motion token name.', {
        publicName,
      });
    }
    return;
  }
}

function expectedTypeForPath(path: string[]): TokenType {
  if (path[0] === 'color') return 'color';
  if (path[0] === 'radius') return 'dimension';
  if (path[0] === 'space') return 'dimension';
  if (path[0] === 'typography' && path[1] === 'family') return 'fontFamily';
  if (path[0] === 'typography' && path[1] === 'size') return 'dimension';
  if (path[0] === 'typography' && (path[1] === 'lineHeight' || path[1] === 'weight')) return 'number';
  if (path[0] === 'control') return 'dimension';
  if (path[0] === 'border') return 'dimension';
  if (path[0] === 'elevation') return 'shadow';
  if (path[0] === 'icon' && path[1] === 'size') return 'dimension';
  if (path[0] === 'icon' && path[1] === 'stroke') return 'number';
  if (path[0] === 'density') return 'number';
  if (path[0] === 'motion' && path[1] === 'duration') return 'duration';
  if (path[0] === 'motion' && path[1] === 'easing') return 'cubicBezier';

  throw new UIFnTokenError('UIFN_TOKEN_PUBLIC_NAME_INVALID', 'Unknown semantic token path.', {
    publicName: publicTokenName(path),
  });
}

function assertTokenValueType(path: string[], token: DesignToken): void {
  const expected = expectedTypeForPath(path);

  if (!PUBLIC_TOKEN_TYPES.has(token.$type)) {
    throw new UIFnTokenError('UIFN_TOKEN_TYPE_INVALID', 'Unknown token $type.', {
      path: path.join('.'),
      type: token.$type,
    });
  }

  if (token.$type !== expected) {
    throw new UIFnTokenError('UIFN_TOKEN_TYPE_INVALID', 'Token $type does not match its semantic path.', {
      path: path.join('.'),
      type: token.$type,
      expected,
    });
  }

  if (token.$type === 'number' && typeof token.$value !== 'number') {
    throw new UIFnTokenError('UIFN_TOKEN_TYPE_INVALID', 'Number tokens must use numeric $value.', {
      path: path.join('.'),
    });
  }

  if (token.$type !== 'number' && typeof token.$value !== 'string') {
    throw new UIFnTokenError('UIFN_TOKEN_TYPE_INVALID', 'String-valued tokens must use string $value.', {
      path: path.join('.'),
      type: token.$type,
    });
  }
}

function assertTokenShape(tokens: TokenTree): void {
  const visited = new WeakSet<object>();
  const visit = (node: unknown, path: string[]): void => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      throw new UIFnTokenError('UIFN_TOKEN_PUBLIC_NAME_INVALID', 'Tokens must include $type and $value.', {
        path: path.join('.'),
      });
    }
    if (visited.has(node)) {
      throw new UIFnTokenError('UIFN_TOKEN_PUBLIC_NAME_INVALID', 'Token groups must be acyclic objects.', {
        path: path.join('.'),
      });
    }
    visited.add(node);
    for (const [key, value] of Object.entries(node)) {
      const nextPath = [...path, key];
      if (isDesignToken(value)) {
        if (!value.$type || value.$value === undefined || value.$value === null) {
          throw new UIFnTokenError('UIFN_TOKEN_PUBLIC_NAME_INVALID', 'Tokens must include $type and $value.', {
            path: nextPath.join('.'),
          });
        }
      } else if (value && typeof value === 'object' && !Array.isArray(value)
        && !('$type' in value) && !('$value' in value)) {
        visit(value, nextPath);
      } else {
        throw new UIFnTokenError('UIFN_TOKEN_PUBLIC_NAME_INVALID', 'Tokens must include $type and $value.', {
          path: nextPath.join('.'),
        });
      }
    }
    visited.delete(node);
  };
  visit(tokens, []);
}

const TOKEN_REFERENCE = /^\{([^}]+)\}$/;

export function resolveTokenReferences(theme: DesignTokenTheme): { theme: DesignTokenTheme; resolvedReferences: number } {
  const flattened = flattenTokens(theme.tokens);
  const byPath = new Map(flattened.map(({ path, token }) => [path.join('.'), token]));
  const cache = new Map<string, string | number>();
  let resolvedReferences = 0;

  const resolve = (tokenPath: string, stack: string[]): string | number => {
    if (cache.has(tokenPath)) return cache.get(tokenPath)!;
    if (stack.includes(tokenPath)) {
      throw new UIFnTokenError('UIFN_TOKEN_REFERENCE_CYCLE', 'Token references cannot form a cycle.', { path: tokenPath, stack });
    }
    const token = byPath.get(tokenPath);
    if (!token) throw new UIFnTokenError('UIFN_TOKEN_REFERENCE_MISSING', 'Token reference target does not exist.', { path: tokenPath });
    const match = typeof token.$value === 'string' ? TOKEN_REFERENCE.exec(token.$value) : null;
    if (!match) { cache.set(tokenPath, token.$value); return token.$value; }
    const targetPath = match[1];
    const target = byPath.get(targetPath);
    if (!target) throw new UIFnTokenError('UIFN_TOKEN_REFERENCE_MISSING', 'Token reference target does not exist.', { path: tokenPath, targetPath });
    if (target.$type !== token.$type) throw new UIFnTokenError('UIFN_TOKEN_TYPE_INVALID', 'Token reference target type differs from its source.', { path: tokenPath, targetPath, type: token.$type, targetType: target.$type });
    if (token.$extensions?.uifn?.fallbackValue === undefined) {
      throw new UIFnTokenError('UIFN_TOKEN_REFERENCE_FALLBACK_MISSING', 'Public token references require an explicit fallback value.', { path: tokenPath, targetPath });
    }
    resolvedReferences += 1;
    const value = resolve(targetPath, [...stack, tokenPath]);
    cache.set(tokenPath, value);
    return value;
  };

  const resolved = structuredClone(theme);
  flattenTokens(resolved.tokens).forEach(({ path, token }) => { token.$value = resolve(path.join('.'), []); });
  return { theme: resolved, resolvedReferences };
}

export function validateMotionAlternatives(theme: DesignTokenTheme): number {
  let count = 0;
  flattenTokens(theme.tokens).forEach(({ path, token }) => {
    if (path[0] !== 'motion' || path[1] !== 'duration') return;
    if (token.$extensions?.uifn?.reducedMotionValue === undefined) {
      throw new UIFnTokenError('UIFN_REDUCED_MOTION_VIOLATION', 'Motion duration tokens require an explicit reduced-motion alternative.', { path: path.join('.') });
    }
    count += 1;
  });
  return count;
}

const SEMANTIC_COLOR_PROPERTY = /(?:^|-)color$|^(?:fill|stroke|caretColor|outlineColor)$/;
const SAFE_SEMANTIC_COLOR = /^(?:var\(--uifn-|Canvas|CanvasText|ButtonText|GrayText|Highlight|HighlightText|transparent$|currentColor$)/i;

export function assertSemanticStylesUseTokens(styles: Record<string, string | number>): void {
  for (const [property, value] of Object.entries(styles)) {
    if (SEMANTIC_COLOR_PROPERTY.test(property) && typeof value === 'string' && !SAFE_SEMANTIC_COLOR.test(value.trim())) {
      throw new UIFnTokenError('UIFN_SEMANTIC_COLOR_HARDCODED', 'Semantic color styles must use uifn variables or forced-color system values.', { property, value });
    }
  }
}

export function validateTokenTheme(theme: DesignTokenTheme): TokenValidationResult {
  assertTokenShape(theme.tokens);
  const flattened = flattenTokens(theme.tokens);

  flattened.forEach(({ path, token }) => {
    assertAllowedPublicPath(path);
    assertTokenValueType(path, token);
  });

  const presentPaths = new Set(flattened.map(({ path }) => path.join('.')));
  REQUIRED_PUBLIC_TOKEN_PATHS.forEach((path) => {
    const tokenPath = path.join('.');
    if (!presentPaths.has(tokenPath)) {
      throw new UIFnTokenError('UIFN_TOKEN_REQUIRED_GROUP_MISSING', 'Theme is missing a required public token.', {
        path: tokenPath,
      });
    }
  });

  const resolved = resolveTokenReferences(theme);
  const motionAlternatives = validateMotionAlternatives(theme);
  validateThemeContrast(resolved.theme);

  return {
    ok: true,
    publicNames: flattened.map(({ path }) => publicTokenName(path)),
    resolvedReferences: resolved.resolvedReferences,
    motionAlternatives,
  };
}
