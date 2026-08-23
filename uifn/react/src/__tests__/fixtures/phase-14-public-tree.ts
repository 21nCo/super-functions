import * as React from 'react';
import manifest from '../../../../.conduct/generated/phase-14/phase-14-public-vectors.json';
import { createPhase14HarnessRuntime, phase14PartProps } from '../../../../parity/src/trace.mjs';
import * as UIFnReact from '../../index';
import type { ReactPrimitiveBridge, ReactPrimitiveRenderPayload } from '../../internal/compound';

export type Phase14ReactVector = (typeof manifest.vectors)[number];
type PublicCompound = React.ElementType & Record<string, React.ElementType>;

const childlessElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'textarea', 'track', 'wbr']);

function elementName(element: string): keyof React.JSX.IntrinsicElements {
  return (element === 'heading' ? 'h2' : element) as keyof React.JSX.IntrinsicElements;
}

function compound(name: string): PublicCompound {
  return (UIFnReact as Record<string, unknown>)[name] as PublicCompound;
}

export function createPhase14ReactPublicTree(
  vector: Phase14ReactVector,
  runtime: ReturnType<typeof createPhase14HarnessRuntime>,
  capture: (bridge: ReactPrimitiveBridge) => void = () => undefined,
): React.ReactElement {
  const Compound = compound(vector.primitive);
  const [root, ...parts] = vector.anatomy;
  const Root = Compound[root.component];
  const renderPart = (part: Phase14ReactVector['anatomy'][number], children?: React.ReactNode) => {
    const Part = Compound[part.component];
    const props: Record<string, unknown> = {
      key: `${part.id}:${String('value' in part ? part.value : 'one')}`,
      ...phase14PartProps(vector, part),
    };
    return React.createElement(
      Part,
      props,
      childlessElements.has(elementName(part.element)) ? undefined : (children ?? `${vector.primitive} ${part.component}`),
    );
  };
  const part = (id: string) => parts.find((candidate) => candidate.id === id)!;
  const menuChildren = () => [
    renderPart(part('trigger')),
    renderPart(part('positioner'), renderPart(part('content'), [
      renderPart(part('item'), renderPart(part('itemIndicator'))),
      renderPart(part('separator')),
      renderPart(part('group'), renderPart(part('groupLabel'))),
      renderPart(part('submenuTrigger')),
      renderPart(part('submenuContent')),
    ])),
  ];
  const children = ['Menu', 'ContextMenu'].includes(vector.primitive)
    ? menuChildren()
    : vector.primitive === 'DatePicker'
    ? [
        renderPart(part('label')),
        renderPart(part('input'), renderPart(part('segment'))),
        renderPart(part('trigger')),
        renderPart(part('positioner'), renderPart(part('content'), [
          renderPart(part('header'), [renderPart(part('previous')), renderPart(part('next'))]),
          renderPart(part('grid'), [
            renderPart(part('gridLabel')),
            React.createElement('tbody', { key: 'date-picker-body' },
              React.createElement('tr', null, renderPart(part('cell'), renderPart(part('cellTrigger'))))),
          ]),
        ])),
        renderPart(part('hiddenInput')),
      ]
    : vector.primitive === 'Table'
    ? [
        renderPart(part('table'), [
          renderPart(part('caption')),
          renderPart(part('header'), React.createElement('tr', null, renderPart(part('head')))),
          renderPart(part('body'), renderPart(part('row'), renderPart(part('cell')))),
          renderPart(part('footer'), React.createElement('tr', null, React.createElement('td', null, 'Table footer'))),
        ]),
      ]
    : parts.map((candidate) => renderPart(candidate));
  const renderRoot = (payload: ReactPrimitiveRenderPayload) => {
    capture(payload.bridge);
    return React.createElement(elementName(root.element), payload.props);
  };
  return React.createElement(Root, { ...runtime.rootProps, render: renderRoot }, children.length ? children : undefined);
}
