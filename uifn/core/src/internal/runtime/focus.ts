import type { UIFnPartEvent } from '../../parts';

interface UIFnFocusableTarget {
  focus?: () => void;
}

interface UIFnFocusableRoot {
  getElementById?: (id: string) => UIFnFocusableTarget | null;
}

interface UIFnFocusableCurrentTarget {
  ownerDocument?: UIFnFocusableRoot & {
    defaultView?: {
      requestAnimationFrame?: (callback: () => void) => unknown;
    } | null;
  };
  getRootNode?: () => UIFnFocusableRoot;
}

function resolveTarget(
  event: UIFnPartEvent | undefined,
  ids: string | readonly string[],
): UIFnFocusableTarget | null {
  const currentTarget = event?.currentTarget as UIFnFocusableCurrentTarget | null | undefined;
  const root = currentTarget?.getRootNode?.();
  const ownerDocument = currentTarget?.ownerDocument;
  for (const id of typeof ids === 'string' ? [ids] : ids) {
    const target = root?.getElementById?.(id) ?? ownerDocument?.getElementById?.(id);
    if (target) return target;
  }
  return null;
}

/**
 * Moves native focus after a headless roving-focus action. The implementation
 * only relies on structural event/element capabilities, keeping core safe for
 * SSR and non-DOM adapters while giving browser adapters complete keyboard
 * behavior.
 */
export function focusUIFnPart(
  event: UIFnPartEvent | undefined,
  ids: string | readonly string[],
  options: { readonly deferred?: boolean } = {},
): void {
  const focus = () => resolveTarget(event, ids)?.focus?.();
  if (!options.deferred) {
    focus();
    return;
  }
  const currentTarget = event?.currentTarget as UIFnFocusableCurrentTarget | null | undefined;
  const requestAnimationFrame = currentTarget?.ownerDocument?.defaultView?.requestAnimationFrame;
  if (requestAnimationFrame) {
    requestAnimationFrame(focus);
    return;
  }
  Promise.resolve().then(focus);
}
