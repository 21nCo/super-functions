#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = resolve(root, 'uifn/catalog/generated/catalog.json');
const outputPath = resolve(root, 'uifn/evidence/generated/phase-14/phase-14-public-vectors.json');
const mode = process.argv.includes('--write') ? 'write' : process.argv.includes('--check') ? 'check' : null;

if (!mode) {
  throw new Error('Usage: node scripts/generate-uifn-phase-14.mjs --write|--check');
}

const rootFixtures = {
  Autocomplete: { items: ['item', 'item-2'] },
  Carousel: { itemCount: 3, reducedMotion: true },
  CheckboxGroup: { items: ['item', 'item-2'] },
  Clipboard: { capabilityFixture: 'resolved-clipboard', getValueFixture: 'phase-14-value' },
  ColorPicker: { defaultValue: '#000000' },
  Combobox: { items: ['item', 'item-2'] },
  Command: { items: ['item', 'item-2'], defaultOpen: true },
  ContextMenu: { items: [{ id: 'item', textValue: 'Item' }] },
  FileUpload: { multiple: true },
  ImageCropper: { src: '/phase-14-image.png' },
  Listbox: { items: ['item', 'item-2'] },
  Menu: { items: [{ id: 'item', textValue: 'Item' }] },
  Menubar: { items: [{ id: 'item', textValue: 'Item' }, { id: 'item-2', textValue: 'Item 2' }] },
  Meter: { value: 50 },
  NavigationMenu: { items: [{ id: 'item', textValue: 'Item', hasContent: true }, { id: 'item-2', textValue: 'Item 2' }] },
  Pagination: { count: 20 },
  QRCode: { value: 'https://uifn.dev/phase-14', label: 'UIFn Phase 14' },
  RadioGroup: { items: ['item', 'item-2'] },
  ScrollArea: { type: 'always', orientation: 'both' },
  SegmentGroup: { items: ['item', 'item-2'] },
  Select: { items: ['item', 'item-2'] },
  Slider: { defaultValue: [0] },
  Splitter: { defaultSizes: [50, 50] },
  Steps: { count: 3 },
  Tabs: { items: ['item', 'item-2'] },
  Timer: { duration: 1_000 },
  Toast: { duration: null },
  ToggleGroup: { items: ['item', 'item-2'], type: 'multiple' },
  Toolbar: { items: [{ id: 'item' }, { id: 'item-2' }] },
  Tour: {
    defaultOpen: true,
    steps: [
      { id: 'one', title: 'One', description: 'First step', target: '#phase-14-tour-target' },
      { id: 'two', title: 'Two', description: 'Second step', target: '#phase-14-tour-target' },
    ],
  },
  TreeView: { items: [{ id: 'item', textValue: 'Item', hasChildren: true }], selectionMode: 'single' },
};

const actionVectors = {
  Accordion: [{ name: 'setValue', arguments: [['item']] }],
  AlertDialog: [{ name: 'setOpen', arguments: [true] }],
  AngleSlider: [{ name: 'setValue', arguments: [90] }],
  Autocomplete: [{ name: 'setInputValue', arguments: ['item'] }],
  Carousel: [{ name: 'next', arguments: [] }],
  Checkbox: [{ name: 'setChecked', arguments: [true] }],
  CheckboxGroup: [{ name: 'setValue', arguments: [['item-2']] }],
  Clipboard: [{ name: 'copy', arguments: ['phase-14'], await: true }],
  Collapsible: [{ name: 'setOpen', arguments: [true] }],
  ColorPicker: [{ name: 'setValue', arguments: ['#ff0000'] }],
  Combobox: [{ name: 'setInputValue', arguments: ['item'] }],
  Command: [{ name: 'setInputValue', arguments: ['item'] }],
  ContextMenu: [{ name: 'setOpen', arguments: [true] }],
  DateInput: [{ name: 'increment', arguments: ['day'] }],
  DatePicker: [{ name: 'setOpen', arguments: [true] }],
  Dialog: [{ name: 'setOpen', arguments: [true] }],
  Drawer: [{ name: 'setOpen', arguments: [true] }],
  Editable: [{ name: 'setValue', arguments: ['phase-14'] }],
  FileUpload: [{
    name: 'selectFiles',
    arguments: [[{ name: 'phase-14.txt', size: 8, type: 'text/plain', lastModified: 0 }]],
  }],
  FloatingPanel: [{ name: 'setOpen', arguments: [true] }],
  HoverCard: [{ name: 'setOpen', arguments: [true] }],
  ImageCropper: [{ name: 'setZoom', arguments: [2] }],
  Listbox: [{ name: 'setValue', arguments: ['item-2'] }],
  Menu: [{ name: 'setOpen', arguments: [true] }],
  Menubar: [{ name: 'openMenu', arguments: ['item'] }],
  NavigationMenu: [{ name: 'setValue', arguments: ['item'] }],
  NumberInput: [{ name: 'setValue', arguments: ['42'] }],
  Pagination: [{ name: 'next', arguments: [] }],
  PasswordInput: [{ name: 'toggleVisibility', arguments: [] }],
  PinInput: [{ name: 'setValue', arguments: ['1'] }],
  Popover: [{ name: 'setOpen', arguments: [true] }],
  RadioGroup: [{ name: 'setValue', arguments: ['item-2'] }],
  RatingGroup: [{ name: 'select', arguments: [1] }],
  ScrollArea: [{
    name: 'setViewportMetrics',
    arguments: [{ scrollTop: 10, scrollLeft: 5, scrollHeight: 400, scrollWidth: 300, clientHeight: 100, clientWidth: 100 }],
  }],
  SegmentGroup: [{ name: 'setValue', arguments: ['item-2'] }],
  Select: [{ name: 'setOpen', arguments: [true] }],
  SignaturePad: [
    { name: 'pointerStart', arguments: [1, { x: 1, y: 1, pressure: 0.5, time: 0 }] },
    { name: 'pointerEnd', arguments: [1] },
  ],
  Slider: [{ name: 'setValue', arguments: [[25]] }],
  Splitter: [{ name: 'resize', arguments: [0, 10, 'keyboard'] }],
  Steps: [{ name: 'next', arguments: [] }],
  Switch: [{ name: 'setChecked', arguments: [true] }],
  Tabs: [{ name: 'setValue', arguments: ['item-2'] }],
  TagsInput: [{ name: 'addValue', arguments: ['item'] }],
  Timer: [{ name: 'start', arguments: [] }],
  Toast: [{ name: 'add', arguments: [{ id: 'phase-14-toast', title: 'Phase 14', description: 'Parity', duration: null }] }],
  Toggle: [{ name: 'setPressed', arguments: [true] }],
  ToggleGroup: [{ name: 'setValue', arguments: [['item-2']] }],
  Toolbar: [{ name: 'focusItem', arguments: ['item-2'] }],
  Tooltip: [{ name: 'setOpen', arguments: [true] }],
  Tour: [{ name: 'next', arguments: [] }],
  TreeView: [{ name: 'select', arguments: ['item'] }],
};

const callbackProps = {
  Accordion: ['onValueChange'],
  AlertDialog: ['onOpenChange'],
  AngleSlider: ['onValueChange'],
  Autocomplete: ['onInputValueChange'],
  Carousel: ['onIndexChange'],
  Checkbox: ['onCheckedChange'],
  CheckboxGroup: ['onValueChange'],
  Clipboard: ['onStatusChange'],
  Collapsible: ['onOpenChange'],
  ColorPicker: ['onValueChange'],
  Combobox: ['onInputValueChange'],
  Command: ['onInputValueChange'],
  ContextMenu: ['onOpenChange'],
  DateInput: ['onValueChange'],
  DatePicker: ['onOpenChange'],
  Dialog: ['onOpenChange'],
  Drawer: ['onOpenChange'],
  Editable: ['onValueChange'],
  FileUpload: ['onFilesChange'],
  FloatingPanel: ['onOpenChange'],
  HoverCard: ['onOpenChange'],
  ImageCropper: ['onZoomChange'],
  Listbox: ['onValueChange'],
  Menu: ['onOpenChange'],
  Menubar: ['onValueChange'],
  NavigationMenu: ['onValueChange'],
  NumberInput: ['onValueChange'],
  Pagination: ['onPageChange'],
  PinInput: ['onValueChange'],
  Popover: ['onOpenChange'],
  RadioGroup: ['onValueChange'],
  RatingGroup: ['onValueChange'],
  SegmentGroup: ['onValueChange'],
  Select: ['onOpenChange'],
  SignaturePad: ['onValueChange'],
  Slider: ['onValueChange'],
  Splitter: ['onSizesChange'],
  Steps: ['onStepChange'],
  Switch: ['onCheckedChange'],
  Tabs: ['onValueChange'],
  TagsInput: ['onValueChange'],
  Toast: ['onAnnounce'],
  Toggle: ['onPressedChange'],
  Tooltip: ['onOpenChange'],
  Tour: ['onStepChange'],
  TreeView: ['onSelectionChange'],
};

const numericParts = new Set([
  'Carousel.item', 'Carousel.indicator', 'Pagination.item', 'Pagination.pageTrigger',
  'FileUpload.item', 'FileUpload.itemName', 'FileUpload.itemSize', 'FileUpload.itemDelete',
  'PinInput.input', 'RatingGroup.item', 'RatingGroup.itemIndicator', 'Slider.thumb',
  'Slider.valueText', 'Slider.hiddenInput', 'Splitter.panel', 'Splitter.resizeTrigger',
  'Splitter.resizeHandle', 'Steps.item', 'Steps.trigger', 'Steps.indicator',
  'Steps.separator', 'Steps.content', 'Steps.completed',
]);

const explicitPartValues = {
  'ColorPicker.channelSlider': 'r',
  'ColorPicker.channelInput': 'r',
  'DateInput.segment': 'day',
  'DatePicker.segment': 'day',
  'DatePicker.cell': '2024-01-01',
  'DatePicker.cellTrigger': '2024-01-01',
  'FloatingPanel.resizeHandle': 'east',
  'ImageCropper.handle': 'e',
  'Pagination.ellipsis': 'start',
  'ScrollArea.scrollbar': 'vertical',
  'ScrollArea.thumb': 'vertical',
  'Toast.root': 'phase-14-toast',
  'Toast.title': 'phase-14-toast',
  'Toast.description': 'phase-14-toast',
  'Toast.action': 'phase-14-toast',
  'Toast.close': 'phase-14-toast',
};

function componentName(part) {
  return part.split('-').map((value) => value[0].toUpperCase() + value.slice(1)).join('');
}

function partValue(primitive, part) {
  const key = `${primitive}.${part}`;
  if (Object.hasOwn(explicitPartValues, key)) return explicitPartValues[key];
  return numericParts.has(key) ? 0 : 'item';
}

const catalogSource = await readFile(catalogPath, 'utf8');
const catalog = JSON.parse(catalogSource);
const interactiveNames = catalog.primitives
  .filter((primitive) => primitive.implementationKind === 'interactive-controller')
  .map((primitive) => primitive.name);
const missingActions = interactiveNames.filter((name) => !actionVectors[name]);
const unexpectedActions = Object.keys(actionVectors).filter((name) => !interactiveNames.includes(name));
if (missingActions.length || unexpectedActions.length) {
  throw new Error(`Phase 14 action coverage mismatch: missing=${missingActions.join(',') || 'none'} unexpected=${unexpectedActions.join(',') || 'none'}`);
}

const vectors = catalog.primitives.map((primitive) => ({
  id: `phase-14-${primitive.id}-public-tree`,
  primitive: primitive.name,
  primitiveId: primitive.id,
  implementationKind: primitive.implementationKind,
  sourceVectors: primitive.vectors,
  rootFixture: rootFixtures[primitive.name] ?? {},
  actions: actionVectors[primitive.name] ?? [],
  callbacks: callbackProps[primitive.name] ?? [],
  anatomy: primitive.anatomy.map((part) => ({
    id: part.id,
    component: part.id === 'root'
      ? (primitive.name === 'Toast' ? 'Provider' : 'Root')
      : componentName(part.id),
    element: part.element,
    cardinality: part.cardinality,
    ...(part.cardinality === 'many' ? { value: partValue(primitive.name, part.id) } : {}),
  })),
  approvedException: null,
}));

const payload = {
  schemaVersion: 1,
  generatedBy: 'generate-uifn-phase-14.mjs',
  phase: 'PHASE_14',
  requirement: 'PARITY-001',
  catalogSha256: catalog.catalogSha256,
  catalogSourceSha256: createHash('sha256').update(catalogSource).digest('hex'),
  primitiveCount: vectors.length,
  interactiveCount: interactiveNames.length,
  anatomyCount: vectors.reduce((sum, vector) => sum + vector.anatomy.length, 0),
  canonicalVectorCount: vectors.length,
  frameworks: ['react', 'svelte', 'solid'],
  installModes: ['package', 'source'],
  traceChannels: ['steps', 'transactions', 'actions', 'parts', 'dom', 'focus', 'callbacks', 'errors', 'cleanup'],
  vectors,
};

const rendered = `${JSON.stringify(payload, null, 2)}\n`;
if (mode === 'write') {
  await writeFile(outputPath, rendered);
  console.log(`wrote ${outputPath} (${payload.primitiveCount} compounds, ${payload.anatomyCount} parts)`);
} else {
  const current = await readFile(outputPath, 'utf8').catch(() => '');
  if (current !== rendered) {
    console.error('UIFN_PHASE_14_GENERATED_DRIFT');
    process.exitCode = 1;
  } else {
    console.log(`phase 14 public vectors current (${payload.primitiveCount} compounds, ${payload.anatomyCount} parts)`);
  }
}
