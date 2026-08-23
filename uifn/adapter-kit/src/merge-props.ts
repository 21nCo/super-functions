export type AdapterEvent = {
  type: string;
  key?: string;
  defaultPrevented?: boolean;
  preventDefault?: () => void;
  stopPropagation?: () => void;
};

export type AdapterEventHandler<TEvent = AdapterEvent> = (event: TEvent) => void;
export type AdapterStyle = Record<string, string | number | null | undefined>;
export type AdapterAttributes = Record<string, string | number | boolean | null | undefined>;

export interface AdapterProps {
  class?: string;
  className?: string;
  style?: AdapterStyle;
  aria?: AdapterAttributes;
  data?: AdapterAttributes;
  on?: Record<string, AdapterEventHandler | undefined>;
  [key: string]: unknown;
}

const EVENT_HANDLER_PATTERN = /^on[A-Z]/;
const UPPERCASE_PATTERN = /[A-Z]/g;
const UNITLESS_CSS_PROPERTIES = new Set([
  'animation-iteration-count', 'border-image-outset', 'border-image-slice',
  'border-image-width', 'box-flex', 'box-flex-group', 'box-ordinal-group',
  'column-count', 'columns', 'flex', 'flex-grow', 'flex-positive', 'flex-shrink',
  'flex-negative', 'flex-order', 'grid-area', 'grid-column', 'grid-column-end',
  'grid-column-span', 'grid-column-start', 'grid-row', 'grid-row-end',
  'grid-row-span', 'grid-row-start', 'font-weight', 'line-clamp', 'line-height',
  'opacity', 'order', 'orphans', 'scale', 'tab-size', 'widows', 'z-index', 'zoom',
  'fill-opacity', 'flood-opacity', 'stop-opacity', 'stroke-dasharray',
  'stroke-dashoffset', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width',
]);

function toKebabCase(value: string): string {
  return value.replace(UPPERCASE_PATTERN, (match) => `-${match.toLowerCase()}`);
}

export function toCssPropertyName(value: string): string {
  if (value.startsWith('--')) return value;
  return toKebabCase(value).replace(/^ms-/, '-ms-');
}

export function toCssPropertyValue(name: string, value: string | number): string {
  if (typeof value !== 'number' || value === 0 || name.startsWith('--') || UNITLESS_CSS_PROPERTIES.has(name)) {
    return String(value);
  }
  return `${value}px`;
}

export function toCssStyleEntries(style: AdapterStyle | undefined): ReadonlyArray<readonly [string, string]> {
  return Object.entries(style ?? {})
    .filter((entry): entry is [string, string | number] => entry[1] !== null && entry[1] !== undefined)
    .map(([name, value]) => {
      const property = toCssPropertyName(name);
      return [property, toCssPropertyValue(property, value)] as const;
    });
}

export function toCssStyleString(style: AdapterStyle | undefined): string | undefined {
  const declarations = toCssStyleEntries(style).map(([name, value]) => `${name}:${value}`);
  return declarations.length ? declarations.join(';') : undefined;
}

function compactClassNames(values: Array<unknown>): string | undefined {
  const className = values
    .flatMap((value) => (typeof value === 'string' ? value.split(/\s+/) : []))
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ');

  return className || undefined;
}

function cleanRecord<TValue>(
  record: Record<string, TValue | null | undefined> | undefined
): Record<string, TValue> {
  return Object.fromEntries(
    Object.entries(record ?? {}).filter(([, value]) => value !== null && value !== undefined)
  ) as Record<string, TValue>;
}

export function mergeEventHandlers<TEvent = AdapterEvent>(
  first?: AdapterEventHandler<TEvent>,
  second?: AdapterEventHandler<TEvent>,
  options: { checkDefaultPrevented?: boolean } = {}
): AdapterEventHandler<TEvent> | undefined {
  if (!first && !second) {
    return undefined;
  }

  return (event: TEvent) => {
    first?.(event);

    if (
      options.checkDefaultPrevented &&
      typeof event === 'object' &&
      event !== null &&
      'defaultPrevented' in event &&
      event.defaultPrevented
    ) {
      return;
    }

    second?.(event);
  };
}

export function normalizeDataAttributes(
  data: AdapterAttributes | undefined,
  prefix = 'data'
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(data ?? {})
      .filter(([, value]) => value !== null && value !== undefined && value !== false)
      .map(([key, value]) => [
        `${prefix}-${toKebabCase(key)}`,
        value === true ? '' : String(value),
      ])
  );
}

export function normalizeAriaAttributes(
  aria: AdapterAttributes | undefined
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(aria ?? {})
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => [`aria-${toKebabCase(key)}`, value as string | number | boolean])
  );
}

export function mergeProps<TProps extends AdapterProps>(...propsList: Array<TProps | undefined>): TProps {
  const merged: AdapterProps = {};

  for (const props of propsList) {
    if (!props) {
      continue;
    }

    for (const [key, value] of Object.entries(props)) {
      if (value === undefined) {
        continue;
      }

      if (key === 'class' || key === 'className') {
        merged[key] = compactClassNames([merged[key], value]);
        continue;
      }

      if (key === 'style') {
        merged.style = {
          ...(merged.style ?? {}),
          ...cleanRecord(value as AdapterStyle),
        };
        continue;
      }

      if (key === 'aria') {
        merged.aria = {
          ...(merged.aria ?? {}),
          ...cleanRecord(value as AdapterAttributes),
        };
        continue;
      }

      if (key === 'data') {
        merged.data = {
          ...(merged.data ?? {}),
          ...cleanRecord(value as AdapterAttributes),
        };
        continue;
      }

      if (key === 'on') {
        const currentHandlers = merged.on ?? {};
        const nextHandlers = value as AdapterProps['on'];
        merged.on = {
          ...currentHandlers,
        };

        Object.entries(nextHandlers ?? {}).forEach(([handlerName, handler]) => {
          merged.on = {
            ...merged.on,
            [handlerName]: mergeEventHandlers(
              currentHandlers[handlerName],
              handler
            ),
          };
        });
        continue;
      }

      if (EVENT_HANDLER_PATTERN.test(key) && typeof value === 'function') {
        merged[key] = mergeEventHandlers(
          merged[key] as AdapterEventHandler | undefined,
          value as AdapterEventHandler
        );
        continue;
      }

      merged[key] = value;
    }
  }

  return merged as TProps;
}
