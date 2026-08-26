import { createComponent, type Component, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import manifest from '../../../../evidence/generated/phase-14/phase-14-public-vectors.json';
import { phase14PartProps } from '../../../../parity/src/trace.mjs';
import * as UIFnSolid from '../../index.js';
import type { SolidPrimitiveBridge, SolidPrimitiveRenderPayload } from '../../internal/compound.jsx';

export type Phase14SolidVector = (typeof manifest.vectors)[number];
type PublicCompound = Component<Record<string, unknown>> & Record<string, Component<Record<string, unknown>>>;

const childlessElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'textarea', 'track', 'wbr']);

function elementName(element: string): keyof JSX.IntrinsicElements {
  return (element === 'heading' ? 'h2' : element) as keyof JSX.IntrinsicElements;
}

function compound(name: string): PublicCompound {
  return (UIFnSolid as Record<string, unknown>)[name] as PublicCompound;
}

export function createPhase14SolidPublicTree(
  vector: Phase14SolidVector,
  runtime: { rootProps: Record<string, unknown> },
  capture: (bridge: SolidPrimitiveBridge) => void = () => undefined,
): JSX.Element {
  const Compound = compound(vector.primitive);
  const [root, ...parts] = vector.anatomy;
  const Root = Compound[root.component];
  const renderPart = (part: Phase14SolidVector['anatomy'][number], children?: () => JSX.Element) => {
    const Part = Compound[part.component];
    const props = phase14PartProps(vector, part) as Record<string, unknown>;
    if (!childlessElements.has(elementName(part.element))) {
      Object.defineProperty(props, 'children', {
        configurable: true,
        enumerable: true,
        get: () => children?.() ?? `${vector.primitive} ${part.component}`,
      });
    }
    return createComponent(Part, props);
  };
  const part = (id: string) => parts.find((candidate) => candidate.id === id)!;
  const menuChildren = () => [
    renderPart(part('trigger')),
    renderPart(part('positioner'), () => renderPart(part('content'), () => [
      renderPart(part('item'), () => renderPart(part('itemIndicator'))),
      renderPart(part('separator')),
      renderPart(part('group'), () => renderPart(part('groupLabel'))),
      renderPart(part('submenuTrigger')),
      renderPart(part('submenuContent')),
    ])),
  ];
  const children = () => ['Menu', 'ContextMenu'].includes(vector.primitive)
    ? menuChildren()
    : vector.primitive === 'DatePicker'
    ? [
        renderPart(part('label')),
        renderPart(part('input'), () => renderPart(part('segment'))),
        renderPart(part('trigger')),
        renderPart(part('positioner'), () => renderPart(part('content'), () => [
          renderPart(part('header'), () => [renderPart(part('previous')), renderPart(part('next'))]),
          renderPart(part('grid'), () => [
            renderPart(part('gridLabel')),
            <tbody><tr>{renderPart(part('cell'), () => renderPart(part('cellTrigger')))}</tr></tbody>,
          ]),
        ])),
        renderPart(part('hiddenInput')),
      ]
    : vector.primitive === 'Table'
    ? [
        renderPart(part('table'), () => [
          renderPart(part('caption')),
          renderPart(part('header'), () => <tr>{renderPart(part('head'))}</tr>),
          renderPart(part('body'), () => renderPart(part('row'), () => renderPart(part('cell')))),
          renderPart(part('footer'), () => <tr><td>Table footer</td></tr>),
        ]),
      ]
    : parts.map((candidate) => renderPart(candidate));
  const rootProps: Record<string, unknown> = {
    ...runtime.rootProps,
    render: (payload: SolidPrimitiveRenderPayload) => {
      capture(payload.bridge);
      const props = payload.props() as Record<string, unknown>;
      if (!childlessElements.has(elementName(root.element))) {
        Object.defineProperty(props, 'children', {
          configurable: true,
          enumerable: true,
          get: children,
        });
      }
      return createComponent(Dynamic as Component<Record<string, unknown>>, {
        component: elementName(root.element),
        ...props,
      });
    },
  };
  return createComponent(Root, rootProps);
}
