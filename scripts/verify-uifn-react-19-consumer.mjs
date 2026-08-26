#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const fixture = mkdtempSync(path.join(tmpdir(), 'uifn-react19-'));
const npm = process.env.UIFN_NPM_BIN ?? 'npm';
const packageJson = {
  private: true,
  type: 'module',
  dependencies: {
    jsdom: '27.0.1',
    react: '19.2.3',
    'react-dom': '19.2.3',
  },
};
const catalogPrimitives = JSON.parse(
  readFileSync(path.join(root, 'uifn/catalog/generated/catalog.json'), 'utf8'),
).primitives;
const catalogPrimitiveCount = catalogPrimitives.length;
const catalogInventory = JSON.stringify(
  catalogPrimitives.map(({ id, name, anatomy }) => ({ id, name, anatomy })),
);

const appModule = `
import React from 'react';
import * as UIFnReact from '@uifn/react';

const catalog = ${catalogInventory};
const fixture = {
  Carousel: { itemCount: 3, reducedMotion: true },
  ImageCropper: { src: '/image.png' },
  Meter: { value: 50 },
  Pagination: { count: 20 },
  QRCode: { value: 'https://example.com', label: 'Example' },
  Steps: { count: 3 },
  Timer: { duration: 1000 },
  Tour: { steps: [{ id: 'intro', title: 'Introduction', description: 'Welcome' }] },
  TreeView: { items: [] },
};
const numericParts = new Set([
  'Carousel.item', 'Carousel.indicator', 'Pagination.item', 'Pagination.pageTrigger',
  'PinInput.input', 'RatingGroup.item', 'RatingGroup.itemIndicator', 'Slider.thumb',
  'Slider.valueText', 'Slider.hiddenInput', 'Splitter.panel', 'Splitter.resizeTrigger',
  'Splitter.resizeHandle', 'Steps.item', 'Steps.trigger', 'Steps.indicator',
  'Steps.separator', 'Steps.content', 'Steps.completed',
]);
const explicitPartValues = {
  'ColorPicker.channelSlider': 'r', 'ColorPicker.channelInput': 'r',
  'DateInput.segment': 'day', 'DatePicker.segment': 'day',
  'DatePicker.cell': '2024-01-01', 'DatePicker.cellTrigger': '2024-01-01',
  'FloatingPanel.resizeHandle': 'east', 'ImageCropper.handle': 'east',
  'Pagination.ellipsis': 'start', 'ScrollArea.scrollbar': 'vertical', 'ScrollArea.thumb': 'vertical',
};
const voidElements = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','textarea','track','wbr']);
const pascal = (value) => value.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
const catalogTrees = catalog.map((primitive) => {
  const Compound = UIFnReact[primitive.name];
  const parts = primitive.anatomy.slice(1);
  const byId = (id) => parts.find((part) => part.id === id);
  const renderPart = (part, children) => {
    const key = primitive.name + '.' + part.id;
    const Part = Compound[pascal(part.id)];
    const partProps = {
      key: part.id,
      'data-react19-part': key,
      ...(part.cardinality === 'many' ? { value: key in explicitPartValues ? explicitPartValues[key] : numericParts.has(key) ? 0 : 'item' } : {}),
      ...(primitive.name === 'DatePicker' && ['grid', 'gridLabel', 'cell'].includes(part.id) ? { render: React.createElement('div') } : {}),
    };
    return React.createElement(Part, partProps, voidElements.has(part.element) ? undefined : (children ?? key));
  };
  const children = primitive.name === 'Table'
    ? [
        renderPart(byId('table'), [
          renderPart(byId('caption')),
          renderPart(byId('header'), React.createElement('tr', null, renderPart(byId('head')))),
          renderPart(byId('body'), renderPart(byId('row'), renderPart(byId('cell')))),
          renderPart(byId('footer'), React.createElement('tr', null, React.createElement('td', null, 'Table footer'))),
        ]),
      ]
    : parts.map((part) => renderPart(part));
  return React.createElement(Compound, { key: primitive.id, ...(fixture[primitive.name] ?? {}), 'data-react19-compound': primitive.name }, children.length ? children : undefined);
});

export const app = React.createElement(React.Suspense, { fallback: React.createElement('span', null, 'loading') },
  React.createElement(React.Fragment, null,
    React.createElement(UIFnReact.Accordion, { defaultValue: ['profile'] },
      React.createElement(UIFnReact.Accordion.Item, { value: 'profile' },
        React.createElement(UIFnReact.Accordion.Trigger, { value: 'profile' }, 'Profile'),
        React.createElement(UIFnReact.Accordion.Content, { value: 'profile' }, 'Details'))),
    React.createElement(UIFnReact.Dialog, { defaultOpen: true },
      React.createElement(UIFnReact.Dialog.Trigger, null, 'Open dialog'),
      React.createElement(UIFnReact.Dialog.Portal, { 'data-react19-portal': '' },
        React.createElement(UIFnReact.Dialog.Content, { 'data-react19-dialog': '' },
          React.createElement(UIFnReact.Dialog.Title, null, 'React 19 dialog'),
          React.createElement(UIFnReact.Dialog.Description, null, 'Hydrated through a portal')))),
    React.createElement('form', { id: 'react19-form' },
      React.createElement(UIFnReact.RatingGroup, { defaultValue: 2, name: 'rating' },
        React.createElement(UIFnReact.RatingGroup.Item, { value: 2 }, 'Two'),
        React.createElement(UIFnReact.RatingGroup.Item, { value: 4 }, 'Four'),
        React.createElement(UIFnReact.RatingGroup.HiddenInput))),
    ...catalogTrees));
`;

const serverConsumer = `
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server.node';
import { app } from './app.mjs';

const renderStream = () => new Promise((resolve, reject) => {
  let html = '';
  const sink = new PassThrough();
  sink.setEncoding('utf8');
  sink.on('data', (chunk) => { html += chunk; });
  sink.on('end', () => resolve(html));
  sink.on('error', reject);
  const stream = renderToPipeableStream(app, {
    onAllReady: () => stream.pipe(sink),
    onError: reject,
  });
});
const first = await renderStream();
const second = await renderStream();
assert.equal(second, first);
assert.match(first, /Profile/);
assert.match(first, /React 19 dialog/);
console.log(JSON.stringify({ html: first, deterministicIds: true, streamingSsr: true }));
`;

const consumer = `
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import React from 'react';
import { JSDOM } from 'jsdom';
import { createRoot, hydrateRoot } from 'react-dom/client';
import * as UIFnReact from '@uifn/react';
import * as AccordionEntry from '@uifn/react/accordion';
import { app } from './app.mjs';

assert.match(React.version, /^19\\./);
assert.equal(typeof UIFnReact.Accordion, 'object');
assert.equal(typeof AccordionEntry.Accordion, 'object');
assert.equal('Dialog' in AccordionEntry, false);
assert.equal(typeof globalThis.document, 'undefined');

const serverRun = spawnSync(process.execPath, ['server.mjs'], { encoding: 'utf8' });
if (serverRun.status !== 0) throw new Error(serverRun.stdout + '\\n' + serverRun.stderr);
const serverResult = JSON.parse(serverRun.stdout.trim().split('\\n').at(-1));
const first = serverResult.html;
assert.equal(serverResult.deterministicIds, true);
assert.equal(serverResult.streamingSsr, true);

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div><div id="strict"></div><div id="boundary"></div></body></html>', { url: 'https://example.test/' });
const window = dom.window;
for (const key of ['window','document','navigator','Node','Element','HTMLElement','HTMLFormElement','HTMLInputElement','ShadowRoot','MutationObserver','DOMRect','Event','MouseEvent','KeyboardEvent','PointerEvent','getComputedStyle']) {
  const value = key === 'getComputedStyle' ? window.getComputedStyle.bind(window) : window[key];
  if (value) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

const warnings = [];
const originalError = console.error;
const originalWarn = console.warn;
console.error = (...args) => warnings.push(['error', ...args]);
console.warn = (...args) => warnings.push(['warn', ...args]);

const rootNode = document.getElementById('root');
rootNode.innerHTML = first;
const hydrated = hydrateRoot(rootNode, app, { onRecoverableError: (error) => warnings.push(['recoverable', error]) });
for (let attempt = 0; attempt < 50 && document.querySelector('[data-react19-portal]')?.parentElement !== document.body; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
if (!/Profile/.test(rootNode.textContent)) throw new Error(JSON.stringify({ first, hydrated: rootNode.innerHTML, warnings }));
assert.equal(document.querySelectorAll('[data-react19-compound]').length, ${catalogPrimitiveCount});
assert.equal(document.querySelectorAll('[data-react19-dialog]').length, 1);
assert.equal(document.querySelector('[data-react19-portal]')?.parentElement, document.body);
const ratingItems = document.querySelectorAll('#react19-form [role="radio"]');
assert.equal(ratingItems.length, 2);
ratingItems[1].click();
await new Promise((resolve) => setTimeout(resolve, 25));
assert.equal(document.querySelector('input[name="rating"]')?.value, '4');
document.getElementById('react19-form').reset();
await new Promise((resolve) => setTimeout(resolve, 25));
assert.equal(document.querySelector('input[name="rating"]')?.value, '2');
hydrated.unmount();

let changes = 0;
const strictNode = document.getElementById('strict');
const strictRoot = createRoot(strictNode, {
  onCaughtError: (error) => { throw error; },
  onUncaughtError: (error) => { throw error; },
  onRecoverableError: (error) => warnings.push(['recoverable', error]),
});
strictRoot.render(React.createElement(React.StrictMode, null,
  React.createElement(UIFnReact.Toggle, { defaultPressed: false, onPressedChange: () => { changes += 1; } }, 'Toggle')));
await new Promise((resolve) => setTimeout(resolve, 25));
const button = strictNode.querySelector('button');
assert.ok(button);
React.startTransition(() => button.click());
await new Promise((resolve) => setTimeout(resolve, 25));
assert.equal(changes, 1);
strictRoot.unmount();
await new Promise((resolve) => setTimeout(resolve, 0));

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() {}
  render() { return this.state.failed ? React.createElement('p', { 'data-boundary-fallback': '' }, 'Recovered') : this.props.children; }
}
function CrashProbe({ crash }) {
  if (crash) throw new Error('phase-11-controlled-boundary');
  return React.createElement(UIFnReact.Collapsible, { defaultOpen: true },
    React.createElement(UIFnReact.Collapsible.Trigger, null, 'Boundary trigger'),
    React.createElement(UIFnReact.Collapsible.Content, null, 'Boundary content'));
}
const boundaryNode = document.getElementById('boundary');
const boundaryRoot = createRoot(boundaryNode, {
  onCaughtError: () => undefined,
  onUncaughtError: (error) => { throw error; },
  onRecoverableError: (error) => warnings.push(['recoverable', error]),
});
boundaryRoot.render(React.createElement(Boundary, null, React.createElement(CrashProbe, { crash: false })));
await new Promise((resolve) => setTimeout(resolve, 25));
assert.match(boundaryNode.textContent, /Boundary content/);
boundaryRoot.render(React.createElement(Boundary, null, React.createElement(CrashProbe, { crash: true })));
await new Promise((resolve) => setTimeout(resolve, 25));
assert.equal(boundaryNode.querySelector('[data-boundary-fallback]')?.textContent, 'Recovered');
boundaryRoot.unmount();
await new Promise((resolve) => setTimeout(resolve, 0));

console.error = originalError;
console.warn = originalWarn;
assert.deepEqual(warnings, []);
console.log(JSON.stringify({
  ok: true,
  react: React.version,
  packageConsumer: true,
  publicCompoundsMounted: ${catalogPrimitiveCount},
  directSubpathTreeShaking: true,
  rscSafeImport: true,
  strictMode: true,
  transition: true,
  suspense: true,
  deterministicIds: true,
  streamingSsr: true,
  ssrHydration: true,
  portalHydration: true,
  formReset: true,
  errorBoundaryCleanup: true,
  abruptUnmount: true,
  warnings: 0,
}));
`;

try {
  for (const [name, directory] of [
    ['@uifn/adapter-kit', 'uifn/adapter-kit'],
    ['@uifn/core', 'uifn/core'],
    ['@uifn/dom', 'uifn/dom'],
    ['@uifn/react', 'uifn/react'],
  ]) {
    const packed = spawnSync(npm, ['pack', path.join(root, directory), '--pack-destination', fixture, '--ignore-scripts', '--json'], {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
    });
    if (packed.status !== 0) throw new Error(`Packing ${name} failed.\n${packed.stdout}\n${packed.stderr}`);
    const filename = JSON.parse(packed.stdout).at(-1).filename;
    packageJson.dependencies[name] = `file:${path.join(fixture, filename)}`;
  }
  writeFileSync(path.join(fixture, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFileSync(path.join(fixture, 'app.mjs'), appModule);
  writeFileSync(path.join(fixture, 'server.mjs'), serverConsumer);
  writeFileSync(path.join(fixture, 'verify.mjs'), consumer);
  const install = spawnSync(npm, ['install', '--ignore-scripts', '--no-package-lock', '--legacy-peer-deps', '--loglevel=error'], {
    cwd: fixture,
    encoding: 'utf8',
    env: process.env,
  });
  if (install.status !== 0) throw new Error(`React 19 clean consumer install failed.\n${install.stdout}\n${install.stderr}`);
  const run = spawnSync(process.execPath, ['verify.mjs'], { cwd: fixture, encoding: 'utf8', env: process.env });
  if (run.status !== 0) throw new Error(`React 19 clean consumer failed.\n${run.stdout}\n${run.stderr}`);
  const result = JSON.parse(run.stdout.trim().split('\n').at(-1));
  console.log(JSON.stringify({ command: 'verify:uifn-react-19-consumer', fixture: 'clean-temporary-install', ...result }, null, 2));
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
