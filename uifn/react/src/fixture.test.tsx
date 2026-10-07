import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { renderPresetFixture } from './fixture';

it('rejects an unmapped public fixture component instead of emitting a custom element', () => {
  expect(() => renderPresetFixture({ type: 'MissingComponent' }, {})).toThrow('Unknown fixture component');
  expect(renderToStaticMarkup(renderPresetFixture({ type: 'p', children: ['Safe <text>'] }, {}))).toBe('<p>Safe &lt;text&gt;</p>');
});

it('shares the portal-container policy with callers and supports server rendering', () => {
  const container = document.createElement('div');
  const Content = ({ container: target }: { container?: HTMLElement }) => <span>{target === container ? 'owned' : 'server'}</span>;
  const node = { type: 'SelectContent' };
  expect(renderToStaticMarkup(renderPresetFixture(node, { SelectContent: Content }, container))).toBe('<span>owned</span>');
  expect(renderToStaticMarkup(renderPresetFixture(node, { SelectContent: Content }))).toBe('<span>server</span>');
});
