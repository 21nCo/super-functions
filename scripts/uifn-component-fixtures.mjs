export const UIFN_COMPONENT_FIXTURE_VERSION = '1.0.0';

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export const COMPONENT_FIXTURE_PARENT_OVERRIDES = Object.freeze({
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
  command: { label: 'root', input: 'root', list: 'root', empty: 'list', loading: 'list', group: 'list', groupHeading: 'group', item: 'group', itemIndicator: 'item', separator: 'list', shortcut: 'item', hiddenInput: 'root' },
  'context-menu': { positioner: 'root', content: 'positioner', item: 'content', itemIndicator: 'item', separator: 'content', group: 'content', groupLabel: 'group', submenuTrigger: 'content', submenuContent: 'content' },
  'date-picker': { segment: 'input', trigger: 'root', positioner: 'root', content: 'positioner', header: 'content', previous: 'header', next: 'header', grid: 'content', gridLabel: 'grid', cell: 'grid', cellTrigger: 'cell', hiddenInput: 'root' },
  dialog: { portal: 'root', backdrop: 'portal', positioner: 'portal', content: 'positioner', title: 'content', description: 'content', close: 'content' },
  drawer: { portal: 'root', backdrop: 'portal', positioner: 'portal', content: 'positioner', handle: 'content', title: 'content', description: 'content', close: 'content' },
  editable: { input: 'control', submit: 'control', cancel: 'control', hiddenInput: 'root' },
  'file-upload': { trigger: 'root', input: 'root', item: 'itemGroup', itemName: 'item', itemSize: 'item', itemDelete: 'item' },
  'floating-panel': { positioner: 'root', content: 'positioner', header: 'content', title: 'header', description: 'header', dragHandle: 'header', resizeHandle: 'content', close: 'content' },
  'hover-card': { positioner: 'root', content: 'positioner', arrow: 'content' },
  'image-cropper': { image: 'viewport', cropArea: 'viewport', handle: 'cropArea', zoomControl: 'viewport', status: 'viewport' },
  'input-group': { addon: 'root', text: 'addon', control: 'root', input: 'control', textarea: 'control', button: 'addon' },
  listbox: { content: 'root', item: 'content', itemIndicator: 'item', group: 'content', groupLabel: 'group', hiddenInput: 'root' },
  marquee: { track: 'viewport', item: 'track' },
  menu: { positioner: 'root', content: 'positioner', item: 'content', itemIndicator: 'item', separator: 'content', group: 'content', groupLabel: 'group', submenuTrigger: 'content', submenuContent: 'content' },
  menubar: { menu: 'root', trigger: 'menu', content: 'menu', item: 'content', submenuTrigger: 'content', submenuContent: 'content' },
  meter: { range: 'track' },
  'navigation-menu': { list: 'root', item: 'list', trigger: 'item', content: 'item', link: 'item', viewport: 'root', indicator: 'root' },
  'number-input': { input: 'control', increment: 'control', decrement: 'control', scrubber: 'control', hiddenInput: 'root', error: 'root' },
  pagination: { list: 'root', item: 'list', pageTrigger: 'item', previous: 'root', next: 'root', ellipsis: 'item' },
  'password-input': { input: 'root', visibilityTrigger: 'root', strength: 'root', error: 'root' },
  'pin-input': { input: 'control', hiddenInput: 'root', error: 'root' },
  popover: { positioner: 'root', content: 'positioner', title: 'content', description: 'content', close: 'content', arrow: 'content' },
  progress: { range: 'track' },
  'radio-group': { item: 'root', itemControl: 'item', itemIndicator: 'itemControl', itemText: 'item', hiddenInput: 'item', error: 'root' },
  'rating-group': { item: 'control', itemIndicator: 'item' },
  'scroll-area': { content: 'viewport', thumb: 'scrollbar' },
  select: { trigger: 'control', valueText: 'trigger', clear: 'control', positioner: 'root', content: 'positioner', item: 'content', itemText: 'item', itemIndicator: 'item', group: 'content', groupLabel: 'group', hiddenInput: 'root' },
  slider: { track: 'control', range: 'track', thumb: 'control', valueText: 'root', hiddenInput: 'root' },
  splitter: { panel: 'root', resizeTrigger: 'root', resizeHandle: 'root' },
  steps: { list: 'root', item: 'list', trigger: 'item', indicator: 'item', separator: 'item', content: 'root', completed: 'root' },
  switch: { control: 'root', thumb: 'control', label: 'root', hiddenInput: 'root' },
  tabs: { list: 'root', trigger: 'list', content: 'root', indicator: 'list' },
  table: { table: 'root', caption: 'table', header: 'table', body: 'table', footer: 'table', row: 'body', head: 'row', cell: 'row' },
  'tags-input': { item: 'control', itemText: 'item', itemDelete: 'item', input: 'control', clear: 'control', hiddenInput: 'root', error: 'root' },
  toast: { root: 'viewport', title: 'root', description: 'root', action: 'root', close: 'root' },
  'toggle-group': { item: 'root' },
  tooltip: { positioner: 'root', content: 'positioner', arrow: 'content' },
  tour: { positioner: 'root', content: 'positioner', title: 'content', description: 'content', close: 'content', action: 'content', previous: 'content', next: 'content' },
  'tree-view': { tree: 'root', item: 'tree', itemTrigger: 'item', itemText: 'item', branch: 'item', indicator: 'item' },
});

const COMPONENT_FIXTURE_REPEAT_OVERRIDES = Object.freeze({
  accordion: { item: 3 },
  autocomplete: { item: 3 },
  breadcrumb: { item: 3, link: 2, separator: 2 },
  carousel: { item: 3, indicator: 3 },
  'checkbox-group': { item: 3 },
  combobox: { item: 3 },
  command: { group: 1, groupHeading: 1, item: 5, itemIndicator: 1, separator: 1, shortcut: 1 },
  'context-menu': { item: 3 },
  'date-input': { segment: 3 },
  'date-picker': { segment: 3, cell: 7 },
  'file-upload': { item: 2 },
  'image-cropper': { handle: 4 },
  'input-group': { addon: 2, text: 1, button: 1 },
  listbox: { item: 3 },
  marquee: { item: 3 },
  menu: { item: 3 },
  menubar: { menu: 2 },
  'navigation-menu': { item: 3 },
  pagination: { item: 3 },
  'pin-input': { input: 6 },
  'radio-group': { item: 3 },
  'rating-group': { item: 5 },
  select: { item: 3 },
  'segment-group': { item: 3 },
  splitter: { panel: 2 },
  steps: { item: 3, content: 3 },
  tabs: { trigger: 3, content: 3 },
  table: { row: 3, head: 3, cell: 6 },
  'tags-input': { item: 2 },
  'toggle-group': { item: 3 },
  'tree-view': { item: 2 },
});

const NUMERIC_COMPONENT_PARTS = new Set([
  'carousel:item',
  'carousel:indicator',
  'file-upload:item',
  'file-upload:itemName',
  'file-upload:itemSize',
  'file-upload:itemDelete',
  'rating-group:item',
  'rating-group:itemIndicator',
  'slider:thumb',
  'slider:valueText',
  'slider:hiddenInput',
  'splitter:panel',
  'splitter:resizeTrigger',
  'splitter:resizeHandle',
  'steps:item',
  'steps:trigger',
  'steps:indicator',
  'steps:separator',
  'steps:content',
  'steps:completed',
]);

const NAMEABLE_ROOT_PRIMITIVES = new Set([
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

const COLLECTION_PRIMITIVES = new Set([
  'autocomplete',
  'checkbox-group',
  'combobox',
  'command',
  'context-menu',
  'listbox',
  'menu',
  'menubar',
  'navigation-menu',
  'radio-group',
  'segment-group',
  'select',
  'tabs',
  'toggle-group',
  'toolbar',
]);

function pascal(value) {
  return value
    .split(/[-_]/)
    .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '')
    .join('');
}

export function sampleComponentInput(input, primitiveId = '') {
  if (!input) return undefined;
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
  if (input.type === 'value-formatter' || input.type.includes('predicate') || input.type === 'unknown') return undefined;
  return 'item-1';
}

export function componentScenarioProps(primitive, scenario) {
  const inputs = new Map(primitive.inputs.map((input) => [input.name, input]));
  const props = {};
  for (const input of primitive.inputs.filter((entry) => entry.required)) {
    const value = sampleComponentInput(input, primitive.id);
    if (value !== undefined) props[input.name] = value;
  }
  const rootPart = primitive.anatomy[0];
  if (rootPart?.cardinality === 'many' && props.value === undefined) props.value = 'item-1';
  if (scenario === 'controlled') {
    for (const name of primitive.controlledModel.valueInputs) {
      const value = sampleComponentInput(inputs.get(name), primitive.id);
      if (value !== undefined) props[name] = value;
    }
  }
  if (scenario === 'uncontrolled') {
    for (const name of primitive.controlledModel.defaultInputs) {
      const value = sampleComponentInput(inputs.get(name), primitive.id);
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

export function componentPartValue(primitiveId, partId) {
  const key = `${primitiveId}:${partId}`;
  if (primitiveId === 'menubar' && partId === 'item') return 'item-2';
  if (primitiveId === 'pagination' && (partId === 'item' || partId === 'pageTrigger')) return 1;
  if (primitiveId === 'pagination' && partId === 'ellipsis') return 'start';
  if (primitiveId === 'rating-group' && (partId === 'item' || partId === 'itemIndicator')) return 1;
  if (NUMERIC_COMPONENT_PARTS.has(key)) return 0;
  if ((primitiveId === 'date-input' || primitiveId === 'date-picker') && partId === 'segment') return 'year';
  if (primitiveId === 'date-picker' && (partId === 'cell' || partId === 'cellTrigger')) return '2026-07-22';
  if (primitiveId === 'color-picker' && (partId === 'channelSlider' || partId === 'channelInput')) return 'r';
  if (primitiveId === 'floating-panel' && partId === 'resizeHandle') return 'south-east';
  if (primitiveId === 'image-cropper' && partId === 'handle') return 'se';
  if (primitiveId === 'pin-input' && partId === 'input') return 0;
  return 'item-1';
}

export function componentPartRecords(primitive) {
  const partIds = new Set(primitive.anatomy.map((part) => part.id));
  const rootPart = primitive.anatomy[0];
  return primitive.anatomy.map((part) => {
    const requestedParent = COMPONENT_FIXTURE_PARENT_OVERRIDES[primitive.id]?.[part.id];
    const parentId = part === rootPart ? null : requestedParent ?? rootPart.id;
    if (parentId !== null && !partIds.has(parentId)) {
      throw new Error(`Invalid component fixture parent ${primitive.id}.${part.id} -> ${parentId}`);
    }
    return {
      ...part,
      exportName: `${primitive.name}${pascal(part.id)}`,
      voidElement: VOID_ELEMENTS.has(part.element),
      parentId,
      value: part.cardinality === 'many' ? componentPartValue(primitive.id, part.id) : undefined,
      repeat: COMPONENT_FIXTURE_REPEAT_OVERRIDES[primitive.id]?.[part.id] ?? 1,
    };
  });
}

export function catalogComponentRootProps(primitive) {
  const props = componentScenarioProps(primitive, 'default');
  const inputs = new Set(primitive.inputs.map((input) => input.name));
  const items = [
    { id: 'item-1', value: 'item-1', label: 'First option', textValue: 'First option' },
    { id: 'item-2', value: 'item-2', label: 'Second option', textValue: 'Second option' },
    { id: 'item-3', value: 'item-3', label: 'Unavailable option', textValue: 'Unavailable option', disabled: true },
  ];

  if (COLLECTION_PRIMITIVES.has(primitive.id) || inputs.has('items')) props.items = items;
  if (primitive.id === 'accordion') {
    props.items = ['item-1', 'item-2'];
    props.defaultValue = [];
    props.type = 'single';
    props.collapsible = true;
  }
  if (primitive.id === 'carousel') {
    props.itemCount = 3;
    props.defaultIndex = 0;
  }
  if (primitive.id === 'checkbox') {
    props.defaultChecked = true;
    props.name = 'notifications';
  }
  if (primitive.id === 'checkbox-group') {
    props.defaultValue = ['item-1'];
    props.name = 'features';
  }
  if (primitive.id === 'combobox' || primitive.id === 'listbox' || primitive.id === 'select') {
    props.defaultValue = 'item-1';
    props.name = primitive.id;
  }
  if (primitive.id === 'date-input' || primitive.id === 'date-picker') {
    props.defaultValue = { year: 2026, month: 7, day: 22 };
    props.locale = 'en-US';
    props.timeZone = 'UTC';
  }
  if (primitive.id === 'file-upload') {
    delete props.files;
    delete props.defaultFiles;
    props.multiple = true;
    props.maxFiles = 3;
  }
  if (primitive.id === 'image-cropper') {
    props.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    props.defaultCrop = { x: 0, y: 0, width: 100, height: 100 };
  }
  if (primitive.id === 'menubar') {
    props.items = [
      { id: 'item-1', value: 'item-1', label: 'File', textValue: 'File' },
      { id: 'item-2', value: 'item-2', label: 'Edit', textValue: 'Edit' },
      { id: 'item-1-action', value: 'item-1-action', label: 'New project', textValue: 'New project', parentId: 'item-1' },
      { id: 'item-2-action', value: 'item-2-action', label: 'Undo change', textValue: 'Undo change', parentId: 'item-2' },
      { id: 'item-1-submenu', value: 'item-1-submenu', label: 'Recent', textValue: 'Recent', parentId: 'item-1' },
      { id: 'item-2-submenu', value: 'item-2-submenu', label: 'Transform', textValue: 'Transform', parentId: 'item-2' },
      { id: 'item-1-submenu-action', value: 'item-1-submenu-action', label: 'Roadmap', textValue: 'Roadmap', parentId: 'item-1-submenu' },
      { id: 'item-2-submenu-action', value: 'item-2-submenu-action', label: 'Uppercase', textValue: 'Uppercase', parentId: 'item-2-submenu' },
    ];
  }
  if (primitive.id === 'meter') props.value = 72;
  if (primitive.id === 'marquee') {
    props.pauseOnHover = true;
    props.pauseOnFocus = true;
  }
  if (primitive.id === 'pagination') {
    props.count = 96;
    props.pageSize = 12;
    props.defaultPage = 2;
  }
  if (primitive.id === 'progress') props.value = 72;
  if (primitive.id === 'qr-code') {
    props.value = 'https://uifn.dev';
    props.label = 'Open the uifn documentation';
  }
  if (primitive.id === 'radio-group' || primitive.id === 'segment-group') {
    props.defaultValue = 'item-1';
    props.name = primitive.id;
  }
  if (primitive.id === 'rating-group') {
    props.defaultValue = 3;
    props.count = 5;
  }
  if (primitive.id === 'slider') {
    props.defaultValue = [64];
    props.min = 0;
    props.max = 100;
  }
  if (primitive.id === 'splitter') props.defaultSizes = [40, 60];
  if (primitive.id === 'steps') {
    props.count = 3;
    props.defaultStep = 1;
  }
  if (primitive.id === 'switch') {
    props.defaultChecked = true;
    props.name = 'darkMode';
  }
  if (primitive.id === 'tabs') {
    props.items = ['item-1', 'item-2', 'item-3'];
    props.defaultValue = 'item-1';
  }
  if (primitive.id === 'tags-input') {
    props.defaultValue = ['item-1', 'item-2'];
  }
  if (primitive.id === 'timer') {
    props.duration = 60_000;
    props.defaultRemaining = 42_000;
  }
  if (primitive.id === 'toast') {
    props.toasts = [{
      id: 'item-1',
      title: 'Changes published',
      description: 'Your project is available to collaborators.',
      duration: null,
    }];
    props.duration = null;
    props.messages = { dismissed: 'Dismiss notification' };
  }
  if (primitive.id === 'toggle-group') {
    props.defaultValue = ['item-1'];
    props.type = 'single';
  }
  if (primitive.id === 'tour') {
    props.steps = [
      { id: 'intro', title: 'Introduction', target: '#uifn-tour-target' },
      { id: 'details', title: 'Component details', target: '#uifn-tour-target' },
      { id: 'finish', title: 'Ready to build', target: '#uifn-tour-target' },
    ];
    props.defaultStep = 0;
    props.defaultOpen = true;
  }
  if (primitive.id === 'tree-view') {
    props.items = [
      {
        id: 'item-1',
        textValue: 'Workspace',
        children: [{ id: 'item-2', textValue: 'Projects' }],
      },
    ];
  }

  if (inputs.has('name') && props.name === undefined) props.name = primitive.id;
  if (NAMEABLE_ROOT_PRIMITIVES.has(primitive.id) && props['aria-label'] === undefined) {
    props['aria-label'] = `${primitive.name} example`;
  }
  return props;
}
