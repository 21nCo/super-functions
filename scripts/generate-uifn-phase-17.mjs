#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createStyledDelivery,
  materializeOutputs,
} from './uifn-delivery-generator.mjs';

export const PHASE_17_GENERATOR_VERSION = '17.0.0';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv.includes('--write') ? 'write' : 'check';
const frameworks = ['react', 'svelte', 'solid'];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const stableText = (value) => `${value.trimEnd()}\n`;
const pascal = (value) => value.split(/[-_]/).map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '').join('');
const escapeHtml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function sourceIdentifier(value, context) {
  const identifier = String(value);
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(identifier)) {
    throw new Error(`UIFN_PHASE17_INVALID_IDENTIFIER: ${context}: ${identifier}`);
  }
  return identifier;
}

function sourceAttributeName(value, context) {
  const attributeName = String(value);
  if (!/^[A-Za-z_:][A-Za-z0-9_.:-]*$/u.test(attributeName)) {
    throw new Error(`UIFN_PHASE17_INVALID_ATTRIBUTE: ${context}: ${attributeName}`);
  }
  return attributeName;
}

function sourceJson(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function readJson(relative) {
  return JSON.parse(readFileSync(path.join(root, relative), 'utf8'));
}

function leafPaths(value, prefix = '') {
  if (Array.isArray(value)) {
    if (value.length === 0) return [prefix];
    return value.flatMap((entry, index) => leafPaths(entry, `${prefix}[${index}]`));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return [prefix];
    return entries.flatMap(([key, entry]) => leafPaths(entry, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

function sectionForField(field) {
  const top = field.split(/[.[]/, 1)[0];
  return {
    accessibility: 'accessibility',
    anatomy: 'anatomy',
    behaviorFamily: 'overview',
    canonicalOrder: 'overview',
    controlledModel: 'controlled-uncontrolled',
    docs: 'overview',
    domServices: 'ssr-hydration',
    events: 'state-actions-parts',
    exceptions: 'known-constraints',
    formSemantics: 'forms',
    frameworks: 'package-install',
    id: 'overview',
    implementationKind: 'overview',
    inputs: 'state-actions-parts',
    name: 'overview',
    outputs: 'source-install',
    release: 'known-constraints',
    requirementIds: 'known-constraints',
    states: 'state-actions-parts',
    stories: 'known-constraints',
  }[top] ?? 'known-constraints';
}

function sampleValue(input, primitiveId = '') {
  if (!input) return undefined;
  if (
    ['autocomplete', 'combobox', 'command'].includes(primitiveId)
    && (input.name === 'inputValue' || input.name === 'defaultInputValue')
  ) return 'First';
  if (input.name === 'src') return 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  if (input.name === 'alt' || input.name === 'label') return 'Example';
  if (primitiveId === 'color-picker' && (input.name === 'value' || input.name === 'defaultValue')) return '#336699';
  if (primitiveId === 'number-input' && (input.name === 'value' || input.name === 'defaultValue')) return '25';
  if (input.type === 'boolean') return true;
  if (input.type === 'number') return 1;
  if (input.type === 'number[]') return [25];
  if (input.type === 'string[]') return ['item-1'];
  if (input.type === 'tour-step[]') return [{ id: 'intro', title: 'Introduction', target: '#uifn-tour-target' }];
  if (input.type === 'tree-node[]') return [{ id: 'item-1', textValue: 'Item 1' }];
  if (input.type === 'file[]' || input.type === 'unknown[]' || input.type.endsWith('[]')) return [];
  if (input.type === 'boolean|string') return 'item-1';
  if (input.type === 'rect') return { x: 0, y: 0, width: 100, height: 40 };
  if (input.type === 'structured-date') return { year: 2026, month: 7, day: 22 };
  if (input.type === 'value-formatter') return undefined;
  if (input.type.includes('predicate')) return undefined;
  if (input.type === 'unknown') return undefined;
  return 'item-1';
}

function scenarioProps(primitive, scenario) {
  const inputs = new Map(primitive.inputs.map((input) => [input.name, input]));
  const props = {};
  for (const input of primitive.inputs.filter((entry) => entry.required)) {
    const value = sampleValue(input, primitive.id);
    if (value !== undefined) props[input.name] = value;
  }
  if (['autocomplete', 'combobox', 'command', 'listbox', 'select'].includes(primitive.id)) {
    props.items = [
      { id: 'item-1', value: 'item-1', label: 'First option', textValue: 'First option' },
      { id: 'item-2', value: 'item-2', label: 'Second option', textValue: 'Second option' },
      { id: 'item-3', value: 'item-3', label: 'Unavailable option', textValue: 'Unavailable option', disabled: true },
    ];
  }
  const rootPart = primitive.anatomy[0];
  if (rootPart?.cardinality === 'many' && props.value === undefined) props.value = 'item-1';
  if (scenario === 'controlled') {
    for (const name of primitive.controlledModel.valueInputs) {
      const value = sampleValue(inputs.get(name), primitive.id);
      if (value !== undefined) props[name] = value;
    }
  }
  if (scenario === 'uncontrolled') {
    for (const name of primitive.controlledModel.defaultInputs) {
      const value = sampleValue(inputs.get(name), primitive.id);
      if (value !== undefined) props[name] = value;
    }
  }
  if (scenario === 'disabled-readonly-invalid') {
    for (const name of ['disabled', 'readOnly', 'invalid']) {
      if (inputs.has(name)) props[name] = true;
    }
  }
  if (scenario === 'anatomy') {
    if (inputs.has('open')) props.open = true;
    else if (inputs.has('defaultOpen')) props.defaultOpen = true;
  }
  if (primitive.anatomy.length === 1 && ['input', 'textarea'].includes(rootPart.element)) {
    props['aria-label'] = `${primitive.name} example`;
  }
  return props;
}

const STORY_PARENT_OVERRIDES = Object.freeze({
  accordion: { item: 'root', header: 'item', trigger: 'header', indicator: 'trigger', content: 'item' },
  'alert-dialog': { portal: 'root', backdrop: 'portal', positioner: 'portal', content: 'positioner', title: 'content', description: 'content', cancel: 'content', action: 'content', close: 'content' },
  autocomplete: { input: 'control', clear: 'control', positioner: 'root', content: 'positioner', item: 'content', empty: 'content' },
  breadcrumb: { list: 'root', item: 'list', link: 'item', page: 'item', separator: 'list', ellipsis: 'item' },
  card: { header: 'root', title: 'header', description: 'header', action: 'header', content: 'root', footer: 'root' },
  carousel: { item: 'viewport', indicator: 'indicatorGroup' },
  checkbox: { control: 'root', indicator: 'control', label: 'root', hiddenInput: 'root' },
  'checkbox-group': { item: 'root', itemControl: 'item', itemIndicator: 'itemControl', hiddenInput: 'item', error: 'root' },
  'color-picker': { trigger: 'control', positioner: 'root', content: 'positioner', area: 'content', areaThumb: 'area', channelSlider: 'content', channelInput: 'content', swatch: 'control', hiddenInput: 'root' },
  combobox: { input: 'control', trigger: 'control', clear: 'control', positioner: 'root', content: 'positioner', item: 'content', itemIndicator: 'item', empty: 'content', hiddenInput: 'root' },
  command: { label: 'root', input: 'root', list: 'root', empty: 'root', loading: 'root', group: 'list', groupHeading: 'group', item: 'group', itemIndicator: 'item', separator: 'root', shortcut: 'item', hiddenInput: 'root' },
  'context-menu': { positioner: 'root', content: 'positioner', item: 'content', itemIndicator: 'item', separator: 'content', group: 'content', groupLabel: 'group', submenuTrigger: 'content', submenuContent: 'content' },
  'date-picker': { segment: 'input', trigger: 'root', positioner: 'root', content: 'positioner', header: 'content', previous: 'header', next: 'header', grid: 'content', gridLabel: 'grid', cell: 'grid', cellTrigger: 'cell', hiddenInput: 'root' },
  dialog: { portal: 'root', backdrop: 'portal', positioner: 'portal', content: 'positioner', title: 'content', description: 'content', close: 'content' },
  drawer: { portal: 'root', backdrop: 'portal', positioner: 'portal', content: 'positioner', handle: 'content', title: 'content', description: 'content', close: 'content' },
  editable: { input: 'control', submit: 'control', cancel: 'control', hiddenInput: 'root' },
  'file-upload': { trigger: 'root', input: 'root', item: 'itemGroup', itemName: 'item', itemSize: 'item', itemDelete: 'item' },
  'floating-panel': { positioner: 'root', content: 'positioner', header: 'content', title: 'header', description: 'header', dragHandle: 'header', resizeHandle: 'content', close: 'content' },
  'hover-card': { positioner: 'root', content: 'positioner' },
  'image-cropper': { image: 'viewport', cropArea: 'viewport', handle: 'cropArea', zoomControl: 'viewport', status: 'viewport' },
  'input-group': { addon: 'root', text: 'addon', control: 'root', input: 'control', textarea: 'control', button: 'addon' },
  listbox: { content: 'root', item: 'content', itemIndicator: 'item', group: 'content', groupLabel: 'group', hiddenInput: 'root' },
  menu: { positioner: 'root', content: 'positioner', item: 'content', itemIndicator: 'item', separator: 'content', group: 'content', groupLabel: 'group', submenuTrigger: 'content', submenuContent: 'content' },
  menubar: { menu: 'root', trigger: 'menu', content: 'menu', item: 'content', submenuTrigger: 'content', submenuContent: 'content' },
  'navigation-menu': { list: 'root', item: 'list', trigger: 'item', content: 'item', link: 'item', viewport: 'root', indicator: 'root' },
  'number-input': { input: 'control', increment: 'control', decrement: 'control', scrubber: 'control', hiddenInput: 'root', error: 'root' },
  pagination: { list: 'root', item: 'list', pageTrigger: 'item', previous: 'root', next: 'root', ellipsis: 'item' },
  'password-input': { input: 'root', visibilityTrigger: 'root', strength: 'root', error: 'root' },
  'pin-input': { input: 'control', hiddenInput: 'root', error: 'root' },
  popover: { positioner: 'root', content: 'positioner', title: 'content', description: 'content', close: 'content', arrow: 'content' },
  'radio-group': { item: 'root', itemControl: 'item', itemIndicator: 'itemControl', itemText: 'item', hiddenInput: 'item', error: 'root' },
  'rating-group': { item: 'control', itemIndicator: 'item' },
  select: { trigger: 'control', valueText: 'trigger', clear: 'control', positioner: 'root', content: 'positioner', item: 'content', itemText: 'item', itemIndicator: 'item', group: 'content', groupLabel: 'group', hiddenInput: 'root' },
  slider: { track: 'control', range: 'track', thumb: 'control', valueText: 'root', hiddenInput: 'root' },
  splitter: { panel: 'root', resizeTrigger: 'root', resizeHandle: 'root' },
  steps: { list: 'root', item: 'list', trigger: 'item', indicator: 'item', separator: 'item', content: 'root', completed: 'root' },
  'switch': { control: 'root', thumb: 'control', label: 'root', hiddenInput: 'root' },
  tabs: { list: 'root', trigger: 'list', content: 'root', indicator: 'list' },
  table: { table: 'root', caption: 'table', header: 'table', body: 'table', footer: 'table', row: 'body', head: 'row', cell: 'row' },
  'tags-input': { item: 'control', itemText: 'item', itemDelete: 'item', input: 'control', clear: 'control', hiddenInput: 'root', error: 'root' },
  toast: { root: 'viewport', title: 'root', description: 'root', action: 'root', close: 'root' },
  'toggle-group': { item: 'root' },
  tooltip: { positioner: 'root', content: 'positioner', arrow: 'content' },
  tour: { positioner: 'root', content: 'positioner', title: 'content', description: 'content', close: 'content', action: 'content', previous: 'content', next: 'content' },
  'tree-view': { tree: 'root', item: 'tree', itemTrigger: 'item', itemText: 'item', branch: 'item', indicator: 'item' },
});

const NUMERIC_STORY_PARTS = new Set([
  'carousel:item', 'carousel:indicator',
  'file-upload:item', 'file-upload:itemName', 'file-upload:itemSize', 'file-upload:itemDelete',
  'rating-group:item', 'rating-group:itemIndicator',
  'slider:thumb', 'slider:valueText', 'slider:hiddenInput',
  'splitter:panel', 'splitter:resizeTrigger', 'splitter:resizeHandle',
  'steps:item', 'steps:trigger', 'steps:indicator', 'steps:separator', 'steps:content', 'steps:completed',
]);

function storyPartValue(primitiveId, partId) {
  const key = `${primitiveId}:${partId}`;
  if (primitiveId === 'pagination' && (partId === 'item' || partId === 'pageTrigger')) return 1;
  if (primitiveId === 'pagination' && partId === 'ellipsis') return 'start';
  if (NUMERIC_STORY_PARTS.has(key)) return 0;
  if ((primitiveId === 'date-input' || primitiveId === 'date-picker') && partId === 'segment') return 'year';
  if (primitiveId === 'date-picker' && (partId === 'cell' || partId === 'cellTrigger')) return '2026-07-22';
  if (primitiveId === 'color-picker' && (partId === 'channelSlider' || partId === 'channelInput')) return 'r';
  if (primitiveId === 'floating-panel' && partId === 'resizeHandle') return 'south-east';
  if (primitiveId === 'image-cropper' && partId === 'handle') return 'se';
  if (primitiveId === 'pin-input' && partId === 'input') return 0;
  return 'item-1';
}

function partRecords(primitive) {
  const partIds = new Set(primitive.anatomy.map((part) => part.id));
  const rootPart = primitive.anatomy[0];
  return primitive.anatomy.map((part) => {
    const requestedParent = STORY_PARENT_OVERRIDES[primitive.id]?.[part.id];
    const parentId = part === rootPart ? null : requestedParent ?? rootPart.id;
    if (parentId !== null && !partIds.has(parentId)) throw new Error(`Invalid Phase 17 story parent ${primitive.id}.${part.id} -> ${parentId}`);
    return {
    ...part,
    exportName: sourceIdentifier(`${primitive.name}${pascal(part.id)}`, `${primitive.id}.${part.id}`),
    voidElement: ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'].includes(part.element),
      parentId,
      value: part.cardinality === 'many' ? storyPartValue(primitive.id, part.id) : undefined,
    };
  });
}

function compatibility(primitive, registry, catalog) {
  return {
    primitive: primitive.id,
    canonicalVersion: catalog.catalogVersion,
    registryVersion: registry.registryVersion,
    frameworks,
    sourcePolicy: registry.sourcePolicy,
    definitionSha256: registry.definitionSha256,
    registryCatalogSha256: registry.catalogSha256,
    certification: 'semantic-parity-complete-external-compatibility-pending',
  };
}

function reactStory(primitive, registry, catalog, scenarios) {
  const parts = partRecords(primitive);
  const imports = parts.map((part) => part.exportName).join(', ');
  const root = parts[0];
  const children = parts.filter((part) => part !== root);
  const storyExports = scenarios.map((scenario) => `export const ${sourceIdentifier(pascal(scenario), `scenario ${scenario}`)} = {
  args: { scenario: ${sourceJson(scenario)} },
  render: () => <StoryHarness Root={${root.exportName}} parts={parts} primitive={${sourceJson(primitive.id)}} scenario={${sourceJson(scenario)}} rootId={${sourceJson(root.id)}} rootElement={${sourceJson(root.element)}} rootProps={${sourceJson(scenarioProps(primitive, scenario))}} rootVoid={${root.voidElement}} />,
};`).join('\n\n');
  return stableText(`/* Generated by the uifn delivery pipeline. Real public-package story; no test doubles. */
import * as React from 'react';
import { ${imports} } from ${sourceJson(`@uifn/components-react/${primitive.id}`)};
import { StoryHarness } from '../harness';

const parts = ${sourceJson(children.map(({ id, exportName, cardinality, element, voidElement, parentId, value }) => ({ id, exportName, many: cardinality === 'many', element, voidElement, parentId, value })))}.map((part) => ({ ...part, Component: ({ ${children.map((part) => part.exportName).join(', ')} } as Record<string, unknown>)[part.exportName] }));
const meta = {
  id: ${sourceJson(`stable-${primitive.id}`)},
  title: ${sourceJson(`Stable/${primitive.name}`)},
  component: StoryHarness,
  tags: ['autodocs'],
  parameters: { controls: { disable: true }, uifnCompatibility: ${sourceJson(compatibility(primitive, registry, catalog))} },
};
export default meta;

${storyExports}`);
}

function solidStory(primitive, registry, catalog, scenarios) {
  const parts = partRecords(primitive);
  const imports = parts.map((part) => part.exportName).join(', ');
  const root = parts[0];
  const children = parts.filter((part) => part !== root);
  const storyExports = scenarios.map((scenario) => `export const ${sourceIdentifier(pascal(scenario), `scenario ${scenario}`)} = {
  args: { scenario: ${sourceJson(scenario)} },
  render: () => <StoryHarness Root={${root.exportName}} parts={parts} primitive={${sourceJson(primitive.id)}} scenario={${sourceJson(scenario)}} rootId={${sourceJson(root.id)}} rootElement={${sourceJson(root.element)}} rootProps={${sourceJson(scenarioProps(primitive, scenario))}} rootVoid={${root.voidElement}} />,
};`).join('\n\n');
  return stableText(`/* Generated by the uifn delivery pipeline. Real public-package story; no test doubles. */
import { ${imports} } from ${sourceJson(`@uifn/components-solid/${primitive.id}`)};
import { StoryHarness } from '../harness';

const parts = ${sourceJson(children.map(({ id, exportName, cardinality, element, voidElement, parentId, value }) => ({ id, exportName, many: cardinality === 'many', element, voidElement, parentId, value })))}.map((part) => ({ ...part, Component: ({ ${children.map((part) => part.exportName).join(', ')} } as Record<string, unknown>)[part.exportName] }));
const meta = {
  id: ${sourceJson(`stable-${primitive.id}`)},
  title: ${sourceJson(`Stable/${primitive.name}`)},
  component: StoryHarness,
  tags: ['autodocs'],
  parameters: { controls: { disable: true }, uifnCompatibility: ${sourceJson(compatibility(primitive, registry, catalog))} },
};
export default meta;

${storyExports}`);
}

function svelteStory(primitive, registry, catalog, scenarios) {
  const parts = partRecords(primitive);
  const imports = parts.map((part) => part.exportName).join(', ');
  const root = parts[0];
  const children = parts.filter((part) => part !== root);
  const storyExports = scenarios.map((scenario) => `export const ${sourceIdentifier(pascal(scenario), `scenario ${scenario}`)} = { args: { scenario: ${sourceJson(scenario)}, rootProps: ${sourceJson(scenarioProps(primitive, scenario))} } };`).join('\n');
  return stableText(`/* Generated by the uifn delivery pipeline. Real public-package story; no test doubles. */
import { ${imports} } from ${sourceJson(`@uifn/components-svelte/${primitive.id}`)};
import StoryHarness from '../StoryHarness.svelte';

const parts = ${sourceJson(children.map(({ id, exportName, cardinality, element, voidElement, parentId, value }) => ({ id, exportName, many: cardinality === 'many', element, voidElement, parentId, value })))}.map((part) => ({ ...part, Component: ({ ${children.map((part) => part.exportName).join(', ')} } as Record<string, unknown>)[part.exportName] }));
const meta = {
  id: ${sourceJson(`stable-${primitive.id}`)},
  title: ${sourceJson(`Stable/${primitive.name}`)},
  component: StoryHarness,
  tags: ['autodocs'],
  args: { Root: ${root.exportName}, parts, primitive: ${sourceJson(primitive.id)}, scenario: 'default', rootId: ${sourceJson(root.id)}, rootElement: ${sourceJson(root.element)}, rootProps: {}, rootVoid: ${root.voidElement} },
  parameters: { controls: { disable: true }, uifnCompatibility: ${sourceJson(compatibility(primitive, registry, catalog))} },
};
export default meta;

${storyExports}`);
}

function packageOrSourceImport(registryArtifact, framework, deliveryMode) {
  if (deliveryMode === 'package') return registryArtifact.frameworks[framework].packageImport;
  if (framework === 'svelte') return `./components/uifn/svelte/${registryArtifact.slug}/index.js`;
  return `./components/uifn/${framework}/${registryArtifact.slug}.js`;
}

const NAMEABLE_ROOT_PRIMITIVES = new Set([
  'button',
  'carousel',
  'date-input',
  'input',
  'menubar',
  'meter',
  'navigation-menu',
  'pagination',
  'progress',
  'radio-group',
  'rating-group',
  'segment-group',
  'slider',
  'splitter',
  'steps',
  'timer',
  'toast',
  'toggle',
  'toggle-group',
  'toolbar',
]);

function sampleCode(primitive, registryArtifact, framework, deliveryMode) {
  const parts = partRecords(primitive);
  const root = parts[0];
  const importTarget = packageOrSourceImport(registryArtifact, framework, deliveryMode);
  const rootProps = scenarioProps(primitive, 'default');
  if (NAMEABLE_ROOT_PRIMITIVES.has(primitive.id) && rootProps['aria-label'] === undefined) rootProps['aria-label'] = `${primitive.name} example`;
  if (framework === 'svelte') {
    const attributes = Object.entries(rootProps).map(([name, value]) => {
      const attributeName = sourceAttributeName(name, `${primitive.id} sample attribute`);
      return typeof value === 'string' ? `${attributeName}=${sourceJson(value)}` : `${attributeName}={${sourceJson(value)}}`;
    }).join(' ');
    return stableText(`<script lang="ts">
  import { ${root.exportName} } from ${sourceJson(importTarget)};
</script>

<${root.exportName} ${attributes} />`);
  }
  if (framework === 'react') {
    return stableText(`import * as React from 'react';
import { ${root.exportName} } from ${sourceJson(importTarget)};

export function ${sourceIdentifier(`${primitive.name}Example`, `${primitive.id} React example`)}() {
  return React.createElement(${root.exportName}, ${sourceJson(rootProps)});
}`);
  }
  return stableText(`import { createComponent } from 'solid-js';
import { ${root.exportName} } from ${sourceJson(importTarget)};

export function ${sourceIdentifier(`${primitive.name}Example`, `${primitive.id} Solid example`)}() {
  return createComponent(${root.exportName}, ${sourceJson(rootProps)});
}`);
}

function docsSections(primitive, registryArtifact, samples) {
  const access = primitive.accessibility.rules;
  const anatomy = partRecords(primitive);
  const api = apiReferenceBySlug[primitive.id];
  if (!api) throw new Error(`UIFN_PHASE17_API_REFERENCE_MISSING: ${primitive.id}`);
  const frameworksTable = frameworks.map((framework) => `| ${framework} | \`${registryArtifact.frameworks[framework].packageImport}\` | \`${registryArtifact.frameworks[framework].files[0].destination}\` |`).join('\n');
  const inputRows = api.rootProps.length
    ? api.rootProps.map((input) => `| \`${input.name}\` | \`${input.type}\` | ${input.required ? 'yes' : 'no'} | ${input.reactive ? 'yes' : 'no'} | \`${input.defaultValue}\` | ${input.description} |`).join('\n')
    : '| — | — | — | — | — | Native root props only. |';
  const stateRows = primitive.states.map((state) => `- \`${state.name}\` (${state.kind})`).join('\n');
  const eventRows = api.events.length
    ? api.events.map((event) => `- \`${event.signature}\` — ${event.description} Source: ${event.source}.`).join('\n')
    : '- No controller event is declared; native element event props remain available.';
  const callbackRows = api.callbacks.length
    ? api.callbacks.map((callback) => `- \`${callback.name}${callback.signature}\` — ${callback.description}`).join('\n')
    : '- No controlled callback is declared; native element event props remain available.';
  const anatomyRows = api.parts.map((part) => `| \`${part.id}\` | \`${part.exportName}\` | \`${part.element}\` | ${part.cardinality} | ${part.valueProp ? `\`${part.valueProp.type}\`` : '—'} | ${part.sharedProps.react.map((value) => `\`${value}\``).join(', ')} | ${part.sharedProps.svelte.map((value) => `\`${value}\``).join(', ')} | ${part.sharedProps.solid.map((value) => `\`${value}\``).join(', ')} |`).join('\n');
  const ownershipRows = [
    `- Core: \`${api.ownership.core}\``,
    `- State: \`${api.ownership.stateType}\``,
    `- Actions: \`${api.ownership.actionsType}\``,
    `- Parts: \`${api.ownership.partsType}\``,
    `- DOM owner: ${api.ownership.dom}`,
    ...Object.entries(api.ownership.contexts).map(([framework, context]) => `- ${framework} context: \`${context}\``),
  ].join('\n');
  const dataAttributeRows = api.dataAttributes.map((attribute) => `- \`${attribute.name}="${attribute.value}"\` on ${attribute.parts}; ${attribute.stability}.`).join('\n');
  const cssVariableRows = api.cssVariables.map((variable) => `- \`${variable.name}\` (${variable.scope})`).join('\n');
  const limitationRows = api.limitations.map((limitation) => `- ${limitation}`).join('\n');
  const sampleBlocks = samples.map((sample) => `#### ${pascal(sample.framework)} · ${sample.deliveryMode}\n\n\`\`\`${sample.language}\n${sample.code.trimEnd()}\n\`\`\``).join('\n\n');
  return {
    overview: `${primitive.name} is the stable styled ${primitive.behaviorFamily} primitive. Behavior is owned by \`@uifn/core\`; framework packages adapt that behavior and the styled packages add public parts and tokens. Implementation kind: \`${primitive.implementationKind}\`.`,
    anatomy: `| Part | Public export | Native basis | Cardinality | Required value | React props | Svelte props | Solid props |\n|---|---|---|---|---|---|---|---|\n${anatomyRows}`,
    'state-actions-parts': `Controller and context ownership:\n\n${ownershipRows}\n\nStates:\n\n${stateRows}\n\nComplete transition signatures:\n\n${eventRows}\n\nControlled callbacks:\n\n${callbackRows}\n\nRoot inputs and defaults:\n\n| Input | Type | Required | Reactive | Default | Description |\n|---|---|---:|---:|---|---|\n${inputRows}`,
    'controlled-uncontrolled': `Control mode: \`${primitive.controlledModel.mode}\`. Controlled inputs: ${primitive.controlledModel.valueInputs.map((value) => `\`${value}\``).join(', ') || 'none'}. Uncontrolled defaults: ${primitive.controlledModel.defaultInputs.map((value) => `\`${value}\``).join(', ') || 'none'}. Change events: ${primitive.controlledModel.changeEvents.map((value) => `\`${value}\``).join(', ') || 'native events only'}. Do not switch mode after mount.`,
    accessibility: `Profile: \`${primitive.accessibility.profile}\`. Native semantic basis: ${access.nativeSemantics}\n\nAccessible name required: ${access.accessibleName.required ? 'yes' : 'no'}; accepted sources: ${access.accessibleName.sources.join(', ') || 'native content'}. WCAG mapping: ${access.wcag.join(', ')}. Normative basis: ${access.normativeBasis.join(', ')}. Final manual accessibility review remains outstanding. Automated and current manual evidence does not include JAWS, which remains explicitly user-deferred.`,
    'keyboard-pointer-touch': `Keyboard model: \`${access.keyboard.model}\`; keys: ${access.keyboard.keys.map((key) => `\`${key}\``).join(', ') || 'native behavior'}. Pointer/touch obligations: ${access.pointerTouch.join(', ') || 'native behavior'}. Focus obligations: ${access.focus.join(', ')}.`,
    forms: `Participation: \`${primitive.formSemantics.participation}\`; value shape: \`${primitive.formSemantics.valueShape}\`; reset: \`${primitive.formSemantics.reset}\`; validation: \`${primitive.formSemantics.validation}\`.`,
    'direction-locale': `RTL contract: ${access.preferences.rtl} Direction is supplied through DOM \`dir\`; locale-sensitive labels and formatting stay application-owned unless a primitive input says otherwise.`,
    'ssr-hydration': `The controller is deterministic and DOM access is adapter-owned. Render the same controlled/default inputs on server and first client render. Portal, presence, root-scope, modality, and tabbability services (${primitive.domServices.join(', ') || 'none'}) activate only after the DOM is available.`,
    'composition-styling': `Use the compound root \`${primitive.name}\` or named parts shown above. Import \`@uifn/components/styles.css\` once, then override tokens or low-specificity part selectors in a later CSS layer.\n\nStable data attributes:\n\n${dataAttributeRows}\n\nCSS variables:\n\n${cssVariableRows}`,
    'package-install': `Published package version: \`${registryArtifact.version}\`; canonical catalog version: \`${primitive.release.channel}\`.\n\n| Framework | Public import | Source-install target |\n|---|---|---|\n${frameworksTable}\n\n${sampleBlocks}`,
    'source-install': `Use \`uifn add ${primitive.id} --framework <react|svelte|solid>\` through \`@uifn/registry\`. The lockfile records the catalog, generator, template, and output hashes. Source-install files have the same public component contract as package delivery; edit intentionally and let \`uifn diff\` report local divergence.`,
    'known-constraints': `Required release channel: \`${primitive.release.channel}\`. Catalog status: \`${primitive.release.catalogStatus}\`. Compatibility certification is still pending external runner/device-lab evidence; this page documents current generated compatibility evidence and is not a complete release certification. Declared exceptions: ${primitive.exceptions.length ? primitive.exceptions.join('; ') : 'none'}.\n\nExplicit limitations:\n\n${limitationRows}`,
  };
}

function markdownPage(primitive, sections) {
  const titles = {
    overview: 'Overview', anatomy: 'Anatomy', 'state-actions-parts': 'State, actions, and parts',
    'controlled-uncontrolled': 'Controlled and uncontrolled', accessibility: 'Accessibility',
    'keyboard-pointer-touch': 'Keyboard, pointer, and touch', forms: 'Forms',
    'direction-locale': 'Direction and locale', 'ssr-hydration': 'SSR and hydration',
    'composition-styling': 'Composition and styling', 'package-install': 'Package install',
    'source-install': 'Source install', 'known-constraints': 'Known constraints',
  };
  return stableText(`# ${primitive.name}\n\nCanonical primitive: \`${primitive.id}\`.\n\n${primitive.docs.requiredSections.map((section) => `## ${titles[section]}\n\n<a id="${section}"></a>\n\n${sections[section]}`).join('\n\n')}`);
}

function htmlPage(primitive, sections) {
  const sectionHtml = primitive.docs.requiredSections.map((section) => `<section id="${section}" data-uifn-doc-section="${section}"><h2>${escapeHtml(section)}</h2><pre>${escapeHtml(sections[section])}</pre></section>`).join('');
  return stableText(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(primitive.name)} · uifn</title></head><body><nav><a href="../index.html">All primitives</a></nav><main data-uifn-doc-page="${primitive.id}"><h1>${escapeHtml(primitive.name)}</h1>${sectionHtml}</main></body></html>`);
}

const catalogSource = readFileSync(path.join(root, 'uifn/catalog/generated/catalog.json'), 'utf8');
const storyManifestSource = readFileSync(path.join(root, 'uifn/catalog/generated/story-manifest.json'), 'utf8');
const docsManifestSource = readFileSync(path.join(root, 'uifn/catalog/generated/docs-manifest.json'), 'utf8');
const registrySource = readFileSync(path.join(root, 'uifn/registry/generated/catalog.json'), 'utf8');
const generatorSource = readFileSync(fileURLToPath(import.meta.url), 'utf8');
const catalog = JSON.parse(catalogSource);
const storyManifest = JSON.parse(storyManifestSource);
const docsManifest = JSON.parse(docsManifestSource);
const registry = JSON.parse(registrySource);
const apiReferenceBySlug = Object.fromEntries(
  createStyledDelivery(root).primitives.map((primitive) => [primitive.id, primitive.api]),
);
const registryBySlug = Object.fromEntries(registry.artifacts.map((artifact) => [artifact.slug, artifact]));
const storyBySlug = Object.fromEntries(storyManifest.primitives.map((primitive) => [primitive.id, primitive]));
const docsBySlug = Object.fromEntries(docsManifest.primitives.map((primitive) => [primitive.id, primitive]));
const definitionSha256 = sha256([catalogSource, storyManifestSource, docsManifestSource, registrySource].join('\n'));
const generatorSha256 = sha256(generatorSource);
const outputs = {};
const storyInventory = [];
const docsCoverage = [];
const sampleManifest = [];

for (const primitive of catalog.primitives) {
  const registryArtifact = registryBySlug[primitive.id];
  if (!registryArtifact || !storyBySlug[primitive.id] || !docsBySlug[primitive.id]) throw new Error(`UIFN_PHASE17_CATALOG_MISMATCH: ${primitive.id}`);
  const scenarios = [...primitive.stories.requiredScenarios, 'anatomy'];
  for (const framework of frameworks) {
    for (const scenario of scenarios) {
      storyInventory.push({
        id: `stable-${primitive.id}--${scenario}`,
        title: `Stable/${primitive.name}`,
        exportName: pascal(scenario),
        framework,
        primitive: primitive.id,
        scenario,
        anatomyPartCount: primitive.anatomy.length,
        compoundRootPart: primitive.anatomy[0].id,
        publicPackage: registryArtifact.frameworks[framework].packageName,
        publicImport: registryArtifact.frameworks[framework].packageImport,
      });
    }
  }
  outputs[`uifn/storybook/workbenches/react/stories/${primitive.id}.stories.tsx`] = reactStory(primitive, registry, catalog, scenarios);
  outputs[`uifn/storybook/workbenches/svelte/stories/${primitive.id}.stories.ts`] = svelteStory(primitive, registry, catalog, scenarios);
  outputs[`uifn/storybook/workbenches/solid/stories/${primitive.id}.stories.tsx`] = solidStory(primitive, registry, catalog, scenarios);

  const primitiveSamples = [];
  for (const framework of frameworks) {
    for (const deliveryMode of ['package', 'source']) {
      const code = sampleCode(primitive, registryArtifact, framework, deliveryMode);
      const sample = {
        id: `${primitive.id}-${framework}-${deliveryMode}`,
        primitive: primitive.id,
        framework,
        deliveryMode,
        language: framework === 'svelte' ? 'svelte' : 'tsx',
        importTarget: packageOrSourceImport(registryArtifact, framework, deliveryMode),
        code,
        sha256: sha256(code),
      };
      primitiveSamples.push(sample);
      sampleManifest.push(sample);
    }
  }
  const sections = docsSections(primitive, registryArtifact, primitiveSamples);
  const markdown = markdownPage(primitive, sections);
  const html = htmlPage(primitive, sections);
  outputs[`uifn/docs/generated/primitives/${primitive.id}.md`] = markdown;
  outputs[`uifn/docs/generated/site/primitives/${primitive.id}.html`] = html;
  const fieldMappings = leafPaths(primitive).map((field) => ({ field, section: sectionForField(field) }));
  docsCoverage.push({
    primitive: primitive.id,
    page: `uifn/docs/generated/primitives/${primitive.id}.md`,
    renderedPage: `uifn/docs/generated/site/primitives/${primitive.id}.html`,
    requiredSections: primitive.docs.requiredSections,
    renderedSections: Object.keys(sections),
    fieldMappings,
    fieldCount: fieldMappings.length,
    sampleIds: primitiveSamples.map((sample) => sample.id),
    markdownSha256: sha256(markdown),
    htmlSha256: sha256(html),
  });
}

const storyPayload = {
  schemaVersion: 1,
  generatorVersion: PHASE_17_GENERATOR_VERSION,
  catalogVersion: catalog.catalogVersion,
  registryVersion: registry.registryVersion,
  frameworks,
  primitiveCount: catalog.primitives.length,
  scenarioCountPerFramework: storyInventory.length / frameworks.length,
  storyCount: storyInventory.length,
  definitionSha256,
  generatorSha256,
  registryCatalogSha256: registry.catalogSha256,
  stories: storyInventory,
};
const docsPayload = {
  schemaVersion: 1,
  generatorVersion: PHASE_17_GENERATOR_VERSION,
  catalogVersion: catalog.catalogVersion,
  registryVersion: registry.registryVersion,
  primitiveCount: catalog.primitives.length,
  requiredSectionCount: docsCoverage.reduce((count, page) => count + page.requiredSections.length, 0),
  mappedFieldCount: docsCoverage.reduce((count, page) => count + page.fieldCount, 0),
  sampleCount: sampleManifest.length,
  definitionSha256,
  generatorSha256,
  pages: docsCoverage,
};
outputs['uifn/storybook/generated/story-inventory.json'] = stableJson(storyPayload);
outputs['uifn/docs/generated/docs-coverage.json'] = stableJson(docsPayload);
outputs['uifn/docs/generated/sample-manifest.json'] = stableJson({ schemaVersion: 1, generatorVersion: PHASE_17_GENERATOR_VERSION, sampleCount: sampleManifest.length, samples: sampleManifest });
outputs['uifn/docs/generated/site/index.html'] = stableText(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>uifn stable primitives</title></head><body><main><h1>uifn stable primitives</h1><p>React, Svelte, and Solid package and source delivery.</p><ul>${catalog.primitives.map((primitive) => `<li><a href="primitives/${primitive.id}.html">${escapeHtml(primitive.name)}</a></li>`).join('')}</ul></main></body></html>`);
outputs['uifn/docs/generated/README.md'] = stableText(`# uifn documentation\n\nThis generated documentation is derived from the canonical ${catalog.primitives.length}-primitive catalog. It covers the controller contract, framework compound APIs, styling, package and source installation, SSR/hydration, form semantics, composition, accessibility, keyboard/pointer/touch behavior, limitations, and migration posture.\n\nSupported stable frameworks: React, Svelte, and Solid.\n\nCompatibility status: semantic parity is complete; signed external browser, assistive-technology, and device-lab certification is still required before release readiness can be called 10/10. JAWS is not in the current matrix by explicit user decision.\n`);
outputs['uifn/docs/generated/controller-api.md'] = stableText(`# Controller API\n\n\`@uifn/core\` owns framework-neutral state, transitions, actions, snapshots, controlled synchronization, form reset/validation bridges, and deterministic serialization. Framework adapters own lifecycle and DOM binding. Applications should dispatch catalog-declared events and read state/actions/parts rather than reaching into private controller fields.\n`);
outputs['uifn/docs/generated/delivery.md'] = stableText(`# Package and source delivery\n\nPackage mode imports stable subpaths from \`@uifn/components-react\`, \`@uifn/components-svelte\`, or \`@uifn/components-solid\`. Source mode uses \`@uifn/registry\` and records definition, generator, template, and output hashes in the consumer lockfile. Both modes expose the same named parts and compound root contract.\n`);
outputs['uifn/docs/generated/migration.md'] = stableText(`# Migration\n\nThe current stable matrix is React, Svelte, and Solid. Previous experimental Vue and Angular adapters were removed and are not supported. Migrate behavior to the framework-neutral controller contract, then replace adapter imports with the corresponding stable framework package. Legacy \`StateMachine\` and \`createMachine\` APIs are removed; use the generated primitive controller exports documented by the canonical catalog.\n`);

const failures = materializeOutputs(root, outputs, {
  mode,
  errorCode: 'UIFN_PHASE17_GENERATED_DRIFT',
  managedRoots: [
    'uifn/storybook/generated',
    'uifn/storybook/workbenches/react/stories',
    'uifn/storybook/workbenches/svelte/stories',
    'uifn/storybook/workbenches/solid/stories',
    'uifn/docs/generated',
  ],
});

if (failures.length) {
  console.error(JSON.stringify({ ok: false, command: 'generate:uifn-phase-17:check', definitionSha256, generatorSha256, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    command: mode === 'write' ? 'generate:uifn-phase-17' : 'generate:uifn-phase-17:check',
    primitiveCount: catalog.primitives.length,
    frameworkCount: frameworks.length,
    storyCount: storyInventory.length,
    docsPageCount: docsCoverage.length,
    docsSectionCount: docsPayload.requiredSectionCount,
    mappedFieldCount: docsPayload.mappedFieldCount,
    sampleCount: sampleManifest.length,
    definitionSha256,
    generatorSha256,
  }, null, 2));
}
