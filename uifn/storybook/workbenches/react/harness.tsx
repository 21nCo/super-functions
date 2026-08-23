// @ts-nocheck
import * as React from 'react';

export function StoryHarness({ Root, parts, primitive, scenario, rootId, rootElement, rootProps, rootVoid }) {
  const childrenFor = (parentId) => parts.filter((part) => part.parentId === parentId);
  const collectionPrimitives = new Set(['autocomplete', 'combobox', 'command', 'listbox', 'select']);
  const instancesFor = (part, parentValue) => {
    if (primitive === 'splitter' && part.id === 'panel') {
      return [{ ...part, value: 0, instanceKey: '0' }, { ...part, value: 1, instanceKey: '1' }];
    }
    if (collectionPrimitives.has(primitive) && part.id === 'item') {
      return ['item-1', 'item-2', 'item-3'].map((value) => ({ ...part, value, instanceKey: value }));
    }
    if (collectionPrimitives.has(primitive) && part.many && parentValue !== undefined) {
      return [{ ...part, value: parentValue, instanceKey: String(parentValue) }];
    }
    return [part];
  };
  const ownText = (part) => {
    if (primitive === 'color-picker' && part.id === 'swatch') return null;
    if (primitive === 'command' && part.id === 'separator') return null;
    if (['button', 'a', 'label', 'legend', 'heading', 'p'].includes(part.element)) return `${part.id} fixture`;
    if (part.id === 'item' || (primitive === 'tooltip' && part.id === 'content')) return `${part.id} fixture`;
    return null;
  };
  const renderTable = () => {
    const part = (id) => parts.find((entry) => entry.id === id)?.Component;
    const Table = part('table');
    const Caption = part('caption');
    const Header = part('header');
    const Body = part('body');
    const Footer = part('footer');
    const Row = part('row');
    const Head = part('head');
    const Cell = part('cell');
    return React.createElement(Root, rootProps,
      React.createElement(Table, { 'data-uifn-story-anatomy': 'table' },
        React.createElement(Caption, { 'data-uifn-story-anatomy': 'caption' }, 'Project status'),
        React.createElement(Header, { 'data-uifn-story-anatomy': 'header' },
          React.createElement(Row, { value: 'header', 'data-uifn-story-anatomy': 'row' },
            React.createElement(Head, { value: 'name', 'data-uifn-story-anatomy': 'head' }, 'Project'),
            React.createElement(Head, { value: 'status', 'data-uifn-story-anatomy': 'head' }, 'Status'))),
        React.createElement(Body, { 'data-uifn-story-anatomy': 'body' },
          React.createElement(Row, { value: 'project-1', 'data-uifn-story-anatomy': 'row' },
            React.createElement(Cell, { value: 'project-1-name', 'data-uifn-story-anatomy': 'cell' }, 'Nucleus'),
            React.createElement(Cell, { value: 'project-1-status', 'data-uifn-story-anatomy': 'cell' }, 'Ready')),
          React.createElement(Row, { value: 'project-2', 'data-uifn-story-anatomy': 'row' },
            React.createElement(Cell, { value: 'project-2-name', 'data-uifn-story-anatomy': 'cell' }, 'Router'),
            React.createElement(Cell, { value: 'project-2-status', 'data-uifn-story-anatomy': 'cell' }, 'In review'))),
        React.createElement(Footer, { 'data-uifn-story-anatomy': 'footer' },
          React.createElement(Row, { value: 'summary', 'data-uifn-story-anatomy': 'row' },
            React.createElement(Cell, { value: 'summary', colSpan: 2, 'data-uifn-story-anatomy': 'cell' }, '2 projects')))));
  };
  const renderPart = (part) => {
    const descendants = childrenFor(part.id);
    const regularDescendants = descendants.filter((child) => child.element !== 'td');
    const cellDescendants = descendants.filter((child) => child.element === 'td');
    let children = [ownText(part), ...regularDescendants.flatMap((child) => instancesFor(child, part.value).map(renderPart))].filter(Boolean);
    if (cellDescendants.length) {
      children.push(React.createElement('tbody', { key: `${part.id}-body` },
        React.createElement('tr', null, cellDescendants.map(renderPart))));
    }
    if (
      !part.voidElement
      && children.length === 0
      && !(primitive === 'color-picker' && part.id === 'swatch')
      && !(primitive === 'command' && part.id === 'separator')
    ) children = [`${part.id} fixture`];
    return React.createElement(part.Component, {
      key: `${part.id}-${part.instanceKey ?? 'default'}`,
      ...(part.many ? { value: part.value } : {}),
      ...(part.element === 'img' ? { alt: `${primitive} ${part.id}` } : {}),
      ...(primitive === 'input-group' && ['input', 'textarea'].includes(part.id)
        ? { 'aria-label': `Input group ${part.id}` }
        : {}),
      'data-uifn-story-anatomy': part.id,
    }, part.voidElement ? undefined : children);
  };
  const rootChildren = childrenFor(rootId).flatMap((part) => instancesFor(part).map(renderPart));
  const component = primitive === 'table' ? renderTable() : React.createElement(Root, {
    ...rootProps,
    ...(rootElement === 'img' ? { alt: `${primitive} example` } : {}),
  }, rootVoid ? undefined : (rootChildren.length ? rootChildren : `${primitive} fixture`));
  return React.createElement('section', {
    'data-uifn-story-id': `${primitive}--${scenario}`,
    'data-uifn-story-framework': 'react',
    'data-uifn-story-scenario': scenario,
    'data-uifn-theme': scenario === 'forced-colors' ? 'high-contrast' : 'light',
    'data-uifn-forced-colors': String(scenario === 'forced-colors'),
    'data-uifn-reduced-motion': String(scenario === 'reduced-motion'),
    dir: scenario === 'rtl' ? 'rtl' : 'ltr',
  }, component);
}
