import React from 'react';

export interface ReactFixtureNode {
  type: string;
  props?: Record<string, unknown>;
  children?: Array<ReactFixtureNode | string>;
}

/** Shared by the preset editor and generated applications. */
export function renderPresetFixture(
  node: ReactFixtureNode | string,
  components: Record<string, React.ElementType>,
  container?: HTMLElement | null,
  key = 0,
): React.ReactNode {
  if (typeof node === 'string') return node;
  const component = Object.prototype.hasOwnProperty.call(components, node.type) ? components[node.type] : undefined;
  if (!component && /^[A-Z]/.test(node.type)) throw new TypeError(`Unknown fixture component: ${node.type}`);
  const portal = ['SelectContent', 'MenuContent', 'DialogPortal'].includes(node.type);
  return React.createElement(component ?? node.type, {
    ...node.props,
    key,
    ...(portal && container ? { container } : {}),
  }, ...(node.children ?? []).map((child, index) => renderPresetFixture(child, components, container, index)));
}
