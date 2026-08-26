import {
  ACCESSIBILITY_PROFILES,
  CATALOG_SCHEMA_VERSION,
  CATALOG_VERSION,
  DOC_SECTIONS,
  DOM_SERVICES,
  FORM_PROFILES,
  FRAMEWORK_TARGETS,
  GENERATOR_VERSION,
  STABLE_FRAMEWORKS,
  STORY_PROFILES,
} from './profiles.mjs';

function slugify(name) {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function anatomy(parts) {
  return parts.map((entry) => {
    const [id, element, cardinality = 'one'] = entry.split(':');
    return { id, element, cardinality };
  });
}

function inputs(values) {
  return values.map((entry) => {
    const separator = entry.indexOf(':');
    const rawName = entry.slice(0, separator);
    return {
      name: rawName.replace(/!$/, ''),
      type: entry.slice(separator + 1),
      required: rawName.endsWith('!'),
      reactive: true,
    };
  });
}

function events(values) {
  return values.map((type) => ({ type, source: 'controller-or-native-contract' }));
}

function states(values) {
  return values.map((name) => ({ name, kind: 'semantic' }));
}

function controlled(valueInput, defaultInput, changeEvent, mode = 'single') {
  return { mode, valueInputs: [valueInput], defaultInputs: [defaultInput], changeEvents: [changeEvent] };
}

function nativeControlled(valueInput, changeEvent = 'NATIVE_CHANGE') {
  return { mode: 'native', valueInputs: [valueInput], defaultInputs: [], changeEvents: [changeEvent] };
}

const uncontrolled = { mode: 'none', valueInputs: [], defaultInputs: [], changeEvents: [] };

function frameworkTargets(name) {
  return Object.fromEntries(STABLE_FRAMEWORKS.map((framework) => [framework, {
    ...FRAMEWORK_TARGETS[framework],
    compoundRoot: name,
    support: 'required',
    implementationStatus: 'implemented',
  }]));
}

function vectorsFor(requirementIds) {
  return requirementIds.flatMap((requirementId) => [`TV-${requirementId}-P`, `TV-${requirementId}-N`]);
}

function define(name, config) {
  const id = slugify(name);
  const requirementIds = ['CAT-001', ...config.requirements];
  const kind = config.kind ?? 'interactive-controller';
  const accessibilityProfile = config.accessibilityProfile ?? config.family;
  return {
    id,
    name,
    canonicalOrder: 0,
    behaviorFamily: config.family,
    implementationKind: kind,
    requirementIds,
    anatomy: anatomy(config.anatomy),
    inputs: inputs(config.inputs),
    events: events(config.events ?? []),
    states: states(config.states),
    controlledModel: clone(config.controlledModel ?? uncontrolled),
    formSemantics: clone(FORM_PROFILES[config.form ?? 'none']),
    domServices: [...(config.domServices ?? [])],
    accessibility: {
      profile: accessibilityProfile,
      rules: clone(ACCESSIBILITY_PROFILES[accessibilityProfile]),
      primitiveNotes: [...(config.accessibilityNotes ?? [`Apply the ${accessibilityProfile} profile specifically to ${name}; implementation vectors own exact behavior.`])],
    },
    frameworks: frameworkTargets(name),
    vectors: vectorsFor(requirementIds),
    docs: {
      page: `primitives/${id}`,
      requiredSections: [...DOC_SECTIONS],
      implementationStatus: 'implemented',
    },
    stories: {
      requiredScenarios: [...STORY_PROFILES[kind]],
      implementationStatus: 'implemented',
    },
    outputs: {
      policy: 'canonical-package-and-source-targets',
      core: kind === 'interactive-controller'
        ? [`${name}Controller`, `create${name}Controller`]
        : [`${name}Contract`],
      headlessPackages: STABLE_FRAMEWORKS.map((framework) => FRAMEWORK_TARGETS[framework].headlessPackage),
      styledPackages: STABLE_FRAMEWORKS.map((framework) => FRAMEWORK_TARGETS[framework].styledPackage),
      sourceInstallTargets: {
        react: `generated/react/${id}.tsx`,
        svelte: `generated/svelte/${id}.svelte`,
        solid: `generated/solid/${id}.tsx`,
      },
    },
    release: {
      channel: 'stable-1.0',
      catalogStatus: 'ga-required',
      implementationStatus: 'implemented',
    },
    exceptions: [],
  };
}

const D = DOM_SERVICES;

export const EXPECTED_PRIMITIVE_NAMES = [
  'Accordion', 'AlertDialog', 'AngleSlider', 'Autocomplete', 'Avatar', 'Button', 'Carousel', 'Checkbox',
  'CheckboxGroup', 'Clipboard', 'Collapsible', 'ColorPicker', 'Combobox', 'ContextMenu', 'DateInput',
  'DatePicker', 'Dialog', 'Drawer', 'Editable', 'Field', 'Fieldset', 'FileUpload', 'FloatingPanel', 'Form',
  'HoverCard', 'ImageCropper', 'Input', 'Listbox', 'Marquee', 'Menu', 'Menubar', 'Meter', 'NavigationMenu',
  'NumberInput', 'Pagination', 'PasswordInput', 'PinInput', 'Popover', 'Progress', 'QRCode', 'RadioGroup',
  'RatingGroup', 'ScrollArea', 'SegmentGroup', 'Select', 'Separator', 'SignaturePad', 'Slider', 'Splitter',
  'Steps', 'Switch', 'Tabs', 'TagsInput', 'Timer', 'Toast', 'Toggle', 'ToggleGroup', 'Toolbar', 'Tooltip',
  'Tour', 'TreeView', 'Badge', 'Breadcrumb', 'Card', 'Command', 'InputGroup', 'Skeleton', 'Table', 'Textarea',
];

const primitiveDefinitions = [
  define('Accordion', {
    family: 'disclosure', requirements: ['PRIM-001'],
    anatomy: ['root:div', 'item:div:many', 'header:heading:many', 'trigger:button:many', 'content:div:many', 'indicator:span:many'],
    inputs: ['value:string[]', 'defaultValue:string[]', 'multiple:boolean', 'collapsible:boolean', 'disabled:boolean'],
    events: ['TOGGLE', 'SET_VALUE'], states: ['idle', 'expanded'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE', 'multiple'), domServices: [D.root, D.portal],
  }),
  define('AlertDialog', {
    family: 'modal-overlay', requirements: ['PRIM-002'],
    anatomy: ['root:div', 'trigger:button', 'portal:div', 'backdrop:div', 'positioner:div', 'content:div', 'title:heading', 'description:p', 'cancel:button', 'action:button', 'close:button'],
    inputs: ['open:boolean', 'defaultOpen:boolean', 'initialFocus:string', 'restoreFocus:boolean'],
    events: ['OPEN', 'CLOSE', 'ESCAPE', 'CANCEL', 'ACTION'], states: ['closed', 'opening', 'open', 'closing'],
    controlledModel: controlled('open', 'defaultOpen', 'OPEN_CHANGE'), domServices: [D.root, D.layer, D.focus, D.modal, D.position, D.portal],
    accessibilityNotes: ['Outside interaction does not dismiss by default.', 'A title and least-destructive initial focus strategy are required.'],
  }),
  define('AngleSlider', {
    family: 'range-gesture', requirements: ['PRIM-006'],
    anatomy: ['root:div', 'track:div', 'thumb:div', 'valueText:span', 'hiddenInput:input'],
    inputs: ['value:number', 'defaultValue:number', 'min:number', 'max:number', 'step:number', 'disabled:boolean', 'readOnly:boolean'],
    events: ['POINTER_START', 'POINTER_MOVE', 'POINTER_END', 'KEY_STEP', 'SET_VALUE'], states: ['idle', 'dragging'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE'), form: 'scalar', domServices: [D.root, D.formLive],
  }),
  define('Autocomplete', {
    family: 'selection-collection', requirements: ['PRIM-005'],
    anatomy: ['root:div', 'label:label', 'control:div', 'input:input', 'clear:button', 'positioner:div', 'content:div', 'item:div:many', 'empty:div'],
    inputs: ['value:string', 'defaultValue:string', 'items!:unknown[]', 'filter:string', 'disabled:boolean', 'readOnly:boolean'],
    events: ['INPUT', 'COMPOSITION_START', 'COMPOSITION_END', 'NAVIGATE', 'SELECT', 'CLEAR'], states: ['idle', 'composing', 'open', 'loading'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE'), form: 'scalar', domServices: [D.root, D.layer, D.focus, D.position, D.portal, D.formLive],
  }),
  define('Avatar', {
    family: 'static-foundation', requirements: ['PRIM-001'], kind: 'typed-static-contract',
    anatomy: ['root:span', 'image:img', 'fallback:span'],
    inputs: ['src:string', 'alt!:string', 'fallbackDelay:number'], events: [], states: ['loading', 'loaded', 'error'],
  }),
  define('Button', {
    family: 'static-foundation', requirements: ['PRIM-001'], kind: 'typed-static-contract',
    anatomy: ['root:button', 'icon:span', 'label:span', 'spinner:span'],
    inputs: ['type:string', 'disabled:boolean', 'loading:boolean', 'pressed:boolean'], events: [], states: ['idle', 'pressed', 'loading', 'disabled'],
  }),
  define('Carousel', {
    family: 'range-gesture', requirements: ['PRIM-006'],
    anatomy: ['root:section', 'viewport:div', 'item:div:many', 'previous:button', 'next:button', 'indicatorGroup:div', 'indicator:button:many', 'liveRegion:div'],
    inputs: ['index:number', 'defaultIndex:number', 'itemCount!:number', 'loop:boolean', 'orientation:string', 'autoplayDelay:number'],
    events: ['PREVIOUS', 'NEXT', 'GO_TO', 'DRAG_START', 'DRAG_END', 'PAUSE', 'RESUME'], states: ['idle', 'dragging', 'autoplaying', 'paused'],
    controlledModel: controlled('index', 'defaultIndex', 'INDEX_CHANGE'), domServices: [D.root, D.formLive, D.portal],
  }),
  define('Checkbox', {
    family: 'selection-collection', requirements: ['PRIM-004'],
    anatomy: ['root:label', 'control:button', 'indicator:span', 'label:span', 'hiddenInput:input'],
    inputs: ['checked:boolean|string', 'defaultChecked:boolean|string', 'name:string', 'value:string', 'disabled:boolean', 'readOnly:boolean', 'required:boolean'],
    events: ['TOGGLE', 'SET_CHECKED', 'FORM_RESET'], states: ['unchecked', 'checked', 'indeterminate'],
    controlledModel: controlled('checked', 'defaultChecked', 'CHECKED_CHANGE'), form: 'scalar', domServices: [D.root, D.formLive],
  }),
  define('CheckboxGroup', {
    family: 'selection-collection', requirements: ['PRIM-004'],
    anatomy: ['root:fieldset', 'label:legend', 'item:label:many', 'itemControl:button:many', 'itemIndicator:span:many', 'hiddenInput:input:many', 'error:div'],
    inputs: ['value:string[]', 'defaultValue:string[]', 'name:string', 'disabled:boolean', 'readOnly:boolean', 'required:boolean'],
    events: ['TOGGLE_ITEM', 'SET_VALUE', 'FORM_RESET'], states: ['idle', 'invalid'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE', 'multiple'), form: 'multiple', domServices: [D.root, D.formLive],
  }),
  define('Clipboard', {
    family: 'status-feedback', requirements: ['PRIM-005'],
    anatomy: ['root:div', 'trigger:button', 'status:span'],
    inputs: ['value:string', 'timeout:number', 'disabled:boolean'], events: ['COPY', 'COPY_SUCCESS', 'COPY_ERROR', 'RESET'], states: ['idle', 'pending', 'copied', 'error'],
    domServices: [D.root, D.formLive], accessibilityNotes: ['Clipboard content is never serialized into traces or announcements.'],
  }),
  define('Collapsible', {
    family: 'disclosure', requirements: ['PRIM-001'],
    anatomy: ['root:div', 'trigger:button', 'content:div'], inputs: ['open:boolean', 'defaultOpen:boolean', 'disabled:boolean'],
    events: ['TOGGLE', 'OPEN', 'CLOSE'], states: ['closed', 'opening', 'open', 'closing'],
    controlledModel: controlled('open', 'defaultOpen', 'OPEN_CHANGE'), domServices: [D.root, D.portal],
  }),
  define('ColorPicker', {
    family: 'date-color', requirements: ['PRIM-007'],
    anatomy: ['root:div', 'label:label', 'control:div', 'trigger:button', 'positioner:div', 'content:div', 'area:div', 'areaThumb:div', 'channelSlider:div:many', 'channelInput:input:many', 'swatch:span', 'hiddenInput:input'],
    inputs: ['value:string', 'defaultValue:string', 'open:boolean', 'defaultOpen:boolean', 'colorSpace:string', 'alpha:boolean', 'name:string', 'disabled:boolean', 'readOnly:boolean'],
    events: ['OPEN', 'CLOSE', 'SET_CHANNEL', 'SET_AREA', 'SET_VALUE'], states: ['closed', 'open', 'dragging'],
    controlledModel: { mode: 'compound', valueInputs: ['value', 'open'], defaultInputs: ['defaultValue', 'defaultOpen'], changeEvents: ['VALUE_CHANGE', 'OPEN_CHANGE'] }, form: 'scalar', domServices: [D.root, D.layer, D.focus, D.position, D.portal, D.formLive],
  }),
  define('Combobox', {
    family: 'selection-collection', requirements: ['PRIM-004'],
    anatomy: ['root:div', 'label:label', 'control:div', 'input:input', 'trigger:button', 'clear:button', 'positioner:div', 'content:div', 'item:div:many', 'itemIndicator:span:many', 'empty:div', 'hiddenInput:input'],
    inputs: ['value:unknown', 'defaultValue:unknown', 'inputValue:string', 'items!:unknown[]', 'multiple:boolean', 'name:string', 'disabled:boolean', 'readOnly:boolean', 'required:boolean'],
    events: ['INPUT', 'COMPOSITION_START', 'COMPOSITION_END', 'OPEN', 'CLOSE', 'NAVIGATE', 'SELECT', 'CLEAR'], states: ['closed', 'open', 'composing', 'loading'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE', 'single-or-multiple'), form: 'multiple', domServices: [D.root, D.layer, D.focus, D.position, D.portal, D.formLive],
  }),
  define('ContextMenu', {
    family: 'menu-navigation', requirements: ['PRIM-003'],
    anatomy: ['root:div', 'trigger:div', 'positioner:div', 'content:div', 'item:div:many', 'itemIndicator:span:many', 'separator:div:many', 'group:div:many', 'groupLabel:div:many', 'submenuTrigger:div:many', 'submenuContent:div:many'],
    inputs: ['open:boolean', 'defaultOpen:boolean', 'dir:string', 'loop:boolean'], events: ['CONTEXT_OPEN', 'LONG_PRESS_OPEN', 'CLOSE', 'NAVIGATE', 'TYPEAHEAD', 'SELECT', 'OPEN_SUBMENU'], states: ['closed', 'open', 'submenu-open'],
    controlledModel: controlled('open', 'defaultOpen', 'OPEN_CHANGE'), domServices: [D.root, D.layer, D.focus, D.position, D.portal],
  }),
  define('DateInput', {
    family: 'date-color', requirements: ['PRIM-007'],
    anatomy: ['root:div', 'label:label', 'segment:span:many', 'hiddenInput:input', 'error:div'],
    inputs: ['value:structured-date', 'defaultValue:structured-date', 'locale:string', 'timeZone:string', 'min:structured-date', 'max:structured-date', 'name:string', 'disabled:boolean', 'readOnly:boolean'],
    events: ['FOCUS_SEGMENT', 'EDIT_SEGMENT', 'INCREMENT', 'DECREMENT', 'COMMIT', 'FORM_RESET'], states: ['idle', 'editing', 'invalid'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE'), form: 'scalar', domServices: [D.root, D.formLive],
  }),
  define('DatePicker', {
    family: 'date-color', requirements: ['PRIM-007'],
    anatomy: ['root:div', 'label:label', 'input:div', 'segment:span:many', 'trigger:button', 'positioner:div', 'content:div', 'header:div', 'previous:button', 'next:button', 'grid:table', 'gridLabel:caption', 'cell:td:many', 'cellTrigger:button:many', 'hiddenInput:input'],
    inputs: ['value:structured-date', 'defaultValue:structured-date', 'open:boolean', 'defaultOpen:boolean', 'locale:string', 'timeZone:string', 'min:structured-date', 'max:structured-date', 'unavailable:date-predicate', 'name:string', 'disabled:boolean', 'readOnly:boolean'],
    events: ['OPEN', 'CLOSE', 'EDIT_SEGMENT', 'NAVIGATE_MONTH', 'NAVIGATE_GRID', 'SELECT_DATE', 'FORM_RESET'], states: ['closed', 'open', 'editing', 'invalid'],
    controlledModel: { mode: 'compound', valueInputs: ['value', 'open'], defaultInputs: ['defaultValue', 'defaultOpen'], changeEvents: ['VALUE_CHANGE', 'OPEN_CHANGE'] }, form: 'scalar', domServices: [D.root, D.layer, D.focus, D.position, D.portal, D.formLive],
  }),
  define('Dialog', {
    family: 'modal-overlay', requirements: ['PRIM-002'],
    anatomy: ['root:div', 'trigger:button', 'portal:div', 'backdrop:div', 'positioner:div', 'content:div', 'title:heading', 'description:p', 'close:button'],
    inputs: ['open:boolean', 'defaultOpen:boolean', 'modal:boolean', 'initialFocus:string', 'restoreFocus:boolean'], events: ['OPEN', 'CLOSE', 'ESCAPE', 'INTERACT_OUTSIDE'], states: ['closed', 'opening', 'open', 'closing'],
    controlledModel: controlled('open', 'defaultOpen', 'OPEN_CHANGE'), domServices: [D.root, D.layer, D.focus, D.modal, D.position, D.portal],
  }),
  define('Drawer', {
    family: 'modal-overlay', requirements: ['PRIM-002'],
    anatomy: ['root:div', 'trigger:button', 'portal:div', 'backdrop:div', 'positioner:div', 'content:div', 'handle:div', 'title:heading', 'description:p', 'close:button'],
    inputs: ['open:boolean', 'defaultOpen:boolean', 'side:string', 'modal:boolean', 'dismissThreshold:number'], events: ['OPEN', 'CLOSE', 'ESCAPE', 'DRAG_START', 'DRAG_MOVE', 'DRAG_END', 'DRAG_CANCEL'], states: ['closed', 'opening', 'open', 'dragging', 'closing'],
    controlledModel: controlled('open', 'defaultOpen', 'OPEN_CHANGE'), domServices: [D.root, D.layer, D.focus, D.modal, D.position, D.portal],
  }),
  define('Editable', {
    family: 'forms-input', requirements: ['PRIM-005'],
    anatomy: ['root:div', 'label:label', 'preview:button', 'input:input', 'control:div', 'submit:button', 'cancel:button', 'error:div', 'hiddenInput:input'],
    inputs: ['value:string', 'defaultValue:string', 'editing:boolean', 'defaultEditing:boolean', 'name:string', 'disabled:boolean', 'readOnly:boolean', 'required:boolean'], events: ['EDIT', 'INPUT', 'COMPOSITION_START', 'COMPOSITION_END', 'SUBMIT', 'CANCEL', 'BLUR', 'FORM_RESET'], states: ['preview', 'editing', 'submitting', 'invalid'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE'), form: 'scalar', domServices: [D.root, D.formLive],
  }),
  define('Field', {
    family: 'forms-input', requirements: ['PRIM-001'], kind: 'typed-static-contract',
    anatomy: ['root:div', 'label:label', 'control:div', 'description:div', 'error:div', 'requiredIndicator:span'], inputs: ['name:string', 'disabled:boolean', 'readOnly:boolean', 'required:boolean', 'invalid:boolean'], events: [], states: ['valid', 'invalid', 'disabled'], form: 'native', domServices: [D.formLive],
  }),
  define('Fieldset', {
    family: 'forms-input', requirements: ['PRIM-001'], kind: 'typed-static-contract',
    anatomy: ['root:fieldset', 'legend:legend', 'content:div', 'description:div', 'error:div'], inputs: ['disabled:boolean', 'invalid:boolean'], events: [], states: ['valid', 'invalid', 'disabled'], form: 'native', domServices: [D.formLive],
  }),
  define('FileUpload', {
    family: 'forms-input', requirements: ['PRIM-005'],
    anatomy: ['root:div', 'label:label', 'dropzone:div', 'trigger:button', 'input:input', 'itemGroup:ul', 'item:li:many', 'itemName:span:many', 'itemSize:span:many', 'itemDelete:button:many', 'error:div', 'status:div'],
    inputs: ['files:file[]', 'defaultFiles:file[]', 'accept:string[]', 'multiple:boolean', 'maxFiles:number', 'maxSize:number', 'name:string', 'disabled:boolean', 'required:boolean'], events: ['PICK', 'DROP', 'VALIDATE', 'ADD_FILES', 'REMOVE_FILE', 'CLEAR', 'FORM_RESET'], states: ['idle', 'drag-active', 'validating', 'accepted', 'rejected'],
    controlledModel: controlled('files', 'defaultFiles', 'FILES_CHANGE', 'multiple'), form: 'file', domServices: [D.root, D.formLive], accessibilityNotes: ['File names may be announced to the user but file contents never enter traces or serialization.'],
  }),
  define('FloatingPanel', {
    family: 'modal-overlay', requirements: ['PRIM-002'],
    anatomy: ['root:div', 'trigger:button', 'positioner:div', 'content:div', 'header:div', 'title:heading', 'description:p', 'dragHandle:div', 'resizeHandle:div:many', 'close:button'], inputs: ['open:boolean', 'defaultOpen:boolean', 'modal:boolean', 'placement:string', 'draggable:boolean', 'resizable:boolean'], events: ['OPEN', 'CLOSE', 'DRAG_START', 'DRAG_MOVE', 'DRAG_END', 'RESIZE_START', 'RESIZE_MOVE', 'RESIZE_END'], states: ['closed', 'open', 'dragging', 'resizing'],
    controlledModel: controlled('open', 'defaultOpen', 'OPEN_CHANGE'), domServices: [D.root, D.layer, D.focus, D.position, D.portal],
  }),
  define('Form', {
    family: 'forms-input', requirements: ['PRIM-001'], kind: 'typed-static-contract',
    anatomy: ['root:form', 'errorSummary:div', 'actions:div'], inputs: ['noValidate:boolean', 'disabled:boolean'], events: [], states: ['idle', 'submitting', 'invalid', 'submitted'], form: 'native', domServices: [D.formLive],
  }),
  define('HoverCard', {
    family: 'modal-overlay', requirements: ['PRIM-002'],
    anatomy: ['root:div', 'trigger:a', 'positioner:div', 'content:div', 'arrow:div'], inputs: ['open:boolean', 'defaultOpen:boolean', 'openDelay:number', 'closeDelay:number', 'placement:string'], events: ['POINTER_ENTER', 'POINTER_LEAVE', 'FOCUS', 'BLUR', 'OPEN', 'CLOSE'], states: ['closed', 'opening-delay', 'open', 'closing-delay'],
    controlledModel: controlled('open', 'defaultOpen', 'OPEN_CHANGE'), domServices: [D.root, D.layer, D.focus, D.position, D.portal],
  }),
  define('ImageCropper', {
    family: 'range-gesture', requirements: ['PRIM-001'],
    anatomy: ['root:div', 'viewport:div', 'image:img', 'cropArea:div', 'handle:div:many', 'zoomControl:input', 'status:div'], inputs: ['src!:string', 'crop:rect', 'defaultCrop:rect', 'aspectRatio:number', 'minSize:number', 'maxSize:number', 'disabled:boolean'], events: ['LOAD', 'DRAG_START', 'DRAG_MOVE', 'DRAG_END', 'RESIZE_START', 'RESIZE_MOVE', 'RESIZE_END', 'ZOOM'], states: ['loading', 'ready', 'dragging', 'resizing', 'error'],
    controlledModel: controlled('crop', 'defaultCrop', 'CROP_CHANGE'), domServices: [D.root, D.formLive],
  }),
  define('Input', {
    family: 'forms-input', requirements: ['PRIM-001'], kind: 'typed-static-contract',
    anatomy: ['root:input'], inputs: ['type:string', 'value:string', 'defaultValue:string', 'name:string', 'disabled:boolean', 'readOnly:boolean', 'required:boolean', 'invalid:boolean'], events: [], states: ['idle', 'focused', 'invalid', 'disabled'], controlledModel: nativeControlled('value'), form: 'native', domServices: [D.formLive],
  }),
  define('Listbox', {
    family: 'selection-collection', requirements: ['PRIM-004'],
    anatomy: ['root:div', 'label:label', 'content:div', 'item:div:many', 'itemIndicator:span:many', 'group:div:many', 'groupLabel:div:many', 'hiddenInput:input:many'], inputs: ['value:unknown', 'defaultValue:unknown', 'items!:unknown[]', 'multiple:boolean', 'orientation:string', 'name:string', 'disabled:boolean', 'readOnly:boolean', 'required:boolean'], events: ['NAVIGATE', 'TYPEAHEAD', 'SELECT', 'TOGGLE', 'SET_VALUE', 'FORM_RESET'], states: ['idle', 'focused', 'selecting'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE', 'single-or-multiple'), form: 'multiple', domServices: [D.root, D.formLive],
  }),
  define('Marquee', {
    family: 'static-foundation', requirements: ['PRIM-001'], kind: 'typed-static-contract',
    anatomy: ['root:div', 'viewport:div', 'track:div', 'item:div:many'], inputs: ['direction:string', 'speed:number', 'pauseOnHover:boolean', 'pauseOnFocus:boolean', 'reducedMotionBehavior:string'], events: [], states: ['idle', 'running', 'paused'],
  }),
  define('Menu', {
    family: 'menu-navigation', requirements: ['PRIM-003'],
    anatomy: ['root:div', 'trigger:button', 'positioner:div', 'content:div', 'item:div:many', 'itemIndicator:span:many', 'separator:div:many', 'group:div:many', 'groupLabel:div:many', 'submenuTrigger:div:many', 'submenuContent:div:many'], inputs: ['open:boolean', 'defaultOpen:boolean', 'orientation:string', 'loop:boolean', 'dir:string'], events: ['OPEN', 'CLOSE', 'NAVIGATE', 'TYPEAHEAD', 'SELECT', 'OPEN_SUBMENU', 'CLOSE_SUBMENU'], states: ['closed', 'open', 'submenu-open'],
    controlledModel: controlled('open', 'defaultOpen', 'OPEN_CHANGE'), domServices: [D.root, D.layer, D.focus, D.position, D.portal],
  }),
  define('Menubar', {
    family: 'menu-navigation', requirements: ['PRIM-003'],
    anatomy: ['root:div', 'menu:div:many', 'trigger:button:many', 'content:div:many', 'item:div:many', 'submenuTrigger:div:many', 'submenuContent:div:many'], inputs: ['value:string', 'defaultValue:string', 'loop:boolean', 'dir:string'], events: ['FOCUS_MENU', 'OPEN_MENU', 'CLOSE_MENU', 'NAVIGATE_MENU', 'NAVIGATE_ITEM', 'TYPEAHEAD', 'SELECT'], states: ['idle', 'focused', 'menu-open', 'submenu-open'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE'), domServices: [D.root, D.layer, D.focus, D.position, D.portal],
  }),
  define('Meter', {
    family: 'status-feedback', requirements: ['PRIM-008'], kind: 'typed-static-contract',
    anatomy: ['root:div', 'label:span', 'track:div', 'range:div', 'valueText:span'], inputs: ['value!:number', 'min:number', 'max:number', 'low:number', 'high:number', 'optimum:number', 'formatValue:value-formatter'], events: [], states: ['optimum', 'suboptimum', 'critical'], controlledModel: nativeControlled('value'), domServices: [D.formLive],
  }),
  define('NavigationMenu', {
    family: 'menu-navigation', requirements: ['PRIM-003'],
    anatomy: ['root:nav', 'list:ul', 'item:li:many', 'trigger:button:many', 'content:div:many', 'link:a:many', 'viewport:div', 'indicator:div'], inputs: ['value:string', 'defaultValue:string', 'orientation:string', 'delayDuration:number', 'skipDelayDuration:number', 'dir:string'], events: ['FOCUS_ITEM', 'OPEN_ITEM', 'CLOSE_ITEM', 'NAVIGATE', 'SELECT_LINK'], states: ['idle', 'focused', 'open'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE'), domServices: [D.root, D.layer, D.focus, D.position, D.portal],
  }),
  define('NumberInput', {
    family: 'forms-input', requirements: ['PRIM-005'],
    anatomy: ['root:div', 'label:label', 'control:div', 'input:input', 'increment:button', 'decrement:button', 'scrubber:div', 'hiddenInput:input', 'error:div'], inputs: ['value:string', 'defaultValue:string', 'min:number', 'max:number', 'step:number', 'locale:string', 'name:string', 'disabled:boolean', 'readOnly:boolean', 'required:boolean'], events: ['INPUT', 'COMPOSITION_START', 'COMPOSITION_END', 'INCREMENT', 'DECREMENT', 'SCRUB_START', 'SCRUB_MOVE', 'SCRUB_END', 'COMMIT', 'FORM_RESET'], states: ['idle', 'editing', 'scrubbing', 'invalid'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE'), form: 'scalar', domServices: [D.root, D.formLive],
  }),
  define('Pagination', {
    family: 'menu-navigation', requirements: ['PRIM-003'],
    anatomy: ['root:nav', 'list:ul', 'item:li:many', 'pageTrigger:button:many', 'previous:button', 'next:button', 'ellipsis:span:many'], inputs: ['page:number', 'defaultPage:number', 'count!:number', 'pageSize:number', 'siblingCount:number', 'disabled:boolean'], events: ['FIRST', 'PREVIOUS', 'NEXT', 'LAST', 'GO_TO'], states: ['idle', 'first-page', 'middle-page', 'last-page'],
    controlledModel: controlled('page', 'defaultPage', 'PAGE_CHANGE'), domServices: [D.root],
  }),
  define('PasswordInput', {
    family: 'forms-input', requirements: ['PRIM-005'],
    anatomy: ['root:div', 'label:label', 'input:input', 'visibilityTrigger:button', 'strength:div', 'error:div'], inputs: ['value:string', 'defaultValue:string', 'visible:boolean', 'name:string', 'autocomplete:string', 'disabled:boolean', 'readOnly:boolean', 'required:boolean'], events: ['INPUT', 'COMPOSITION_START', 'COMPOSITION_END', 'TOGGLE_VISIBILITY', 'FORM_RESET'], states: ['masked', 'visible', 'invalid'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE'), form: 'native', domServices: [D.root, D.formLive], accessibilityNotes: ['Password content is always redacted from traces, warnings, and announcements.'],
  }),
  define('PinInput', {
    family: 'forms-input', requirements: ['PRIM-005'],
    anatomy: ['root:div', 'label:label', 'control:div', 'input:input:many', 'hiddenInput:input', 'error:div'], inputs: ['value:string', 'defaultValue:string', 'length:number', 'mask:boolean', 'otp:boolean', 'name:string', 'disabled:boolean', 'readOnly:boolean', 'required:boolean'], events: ['INPUT_SEGMENT', 'PASTE', 'COMPOSITION_START', 'COMPOSITION_END', 'BACKSPACE', 'FOCUS_SEGMENT', 'FORM_RESET'], states: ['empty', 'partial', 'complete', 'invalid'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE'), form: 'scalar', domServices: [D.root, D.formLive],
  }),
  define('Popover', {
    family: 'modal-overlay', requirements: ['PRIM-002'],
    anatomy: ['root:div', 'anchor:div', 'trigger:button', 'positioner:div', 'content:div', 'title:heading', 'description:p', 'arrow:div', 'close:button'], inputs: ['open:boolean', 'defaultOpen:boolean', 'modal:boolean', 'placement:string', 'closeOnEscape:boolean', 'closeOnInteractOutside:boolean'], events: ['OPEN', 'CLOSE', 'ESCAPE', 'INTERACT_OUTSIDE'], states: ['closed', 'opening', 'open', 'closing'],
    controlledModel: controlled('open', 'defaultOpen', 'OPEN_CHANGE'), domServices: [D.root, D.layer, D.focus, D.position, D.portal],
  }),
  define('Progress', {
    family: 'status-feedback', requirements: ['PRIM-008'], kind: 'typed-static-contract',
    anatomy: ['root:div', 'label:span', 'track:div', 'range:div', 'circle:svg', 'valueText:span'], inputs: ['value:number', 'min:number', 'max:number', 'indeterminate:boolean', 'formatValue:value-formatter'], events: [], states: ['indeterminate', 'loading', 'complete', 'error'], controlledModel: nativeControlled('value'), domServices: [D.formLive],
  }),
  define('QRCode', {
    family: 'static-foundation', requirements: ['PRIM-001'], kind: 'typed-static-contract',
    anatomy: ['root:figure', 'image:svg', 'caption:figcaption'], inputs: ['value!:string', 'errorCorrection:string', 'size:number', 'label!:string'], events: [], states: ['ready'],
  }),
  define('RadioGroup', {
    family: 'selection-collection', requirements: ['PRIM-004'],
    anatomy: ['root:fieldset', 'label:legend', 'item:label:many', 'itemControl:button:many', 'itemIndicator:span:many', 'hiddenInput:input:many', 'error:div'], inputs: ['value:string', 'defaultValue:string', 'name:string', 'orientation:string', 'loop:boolean', 'disabled:boolean', 'readOnly:boolean', 'required:boolean'], events: ['NAVIGATE', 'SELECT', 'SET_VALUE', 'FORM_RESET'], states: ['idle', 'focused', 'invalid'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE'), form: 'scalar', domServices: [D.root, D.formLive],
  }),
  define('RatingGroup', {
    family: 'range-gesture', requirements: ['PRIM-006'],
    anatomy: ['root:div', 'label:label', 'control:div', 'item:button:many', 'itemIndicator:span:many', 'hiddenInput:input', 'valueText:span'], inputs: ['value:number', 'defaultValue:number', 'count:number', 'allowHalf:boolean', 'name:string', 'disabled:boolean', 'readOnly:boolean', 'required:boolean'], events: ['NAVIGATE', 'HOVER', 'SELECT', 'CLEAR', 'FORM_RESET'], states: ['idle', 'previewing', 'selected'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE'), form: 'scalar', domServices: [D.root, D.formLive],
  }),
  define('ScrollArea', {
    family: 'range-gesture', requirements: ['PRIM-001'],
    anatomy: ['root:div', 'viewport:div', 'content:div', 'scrollbar:div:many', 'thumb:div:many', 'corner:div'], inputs: ['type:string', 'scrollHideDelay:number', 'orientation:string', 'dir:string'], events: ['SCROLL', 'POINTER_START', 'POINTER_MOVE', 'POINTER_END', 'KEY_SCROLL'], states: ['idle', 'scrolling', 'dragging'], domServices: [D.root],
  }),
  define('SegmentGroup', {
    family: 'selection-collection', requirements: ['PRIM-004'],
    anatomy: ['root:div', 'label:span', 'item:button:many', 'itemText:span:many', 'indicator:div', 'hiddenInput:input'], inputs: ['value:string', 'defaultValue:string', 'name:string', 'orientation:string', 'disabled:boolean', 'readOnly:boolean', 'required:boolean'], events: ['NAVIGATE', 'SELECT', 'SET_VALUE', 'FORM_RESET'], states: ['idle', 'focused', 'selected'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE'), form: 'scalar', domServices: [D.root, D.formLive],
  }),
  define('Select', {
    family: 'selection-collection', requirements: ['PRIM-004'],
    anatomy: ['root:div', 'label:label', 'control:div', 'trigger:button', 'valueText:span', 'clear:button', 'positioner:div', 'content:div', 'item:div:many', 'itemText:span:many', 'itemIndicator:span:many', 'group:div:many', 'groupLabel:div:many', 'hiddenInput:input:many'], inputs: ['value:unknown', 'defaultValue:unknown', 'items!:unknown[]', 'multiple:boolean', 'name:string', 'disabled:boolean', 'readOnly:boolean', 'required:boolean'], events: ['OPEN', 'CLOSE', 'NAVIGATE', 'TYPEAHEAD', 'SELECT', 'DESELECT', 'CLEAR', 'FORM_RESET'], states: ['closed', 'open', 'selecting'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE', 'single-or-multiple'), form: 'multiple', domServices: [D.root, D.layer, D.focus, D.position, D.portal, D.formLive],
  }),
  define('Separator', {
    family: 'static-foundation', requirements: ['PRIM-001'], kind: 'typed-static-contract',
    anatomy: ['root:div'], inputs: ['orientation:string', 'decorative:boolean'], events: [], states: ['ready'],
  }),
  define('SignaturePad', {
    family: 'range-gesture', requirements: ['PRIM-006'],
    anatomy: ['root:div', 'label:label', 'canvas:canvas', 'clear:button', 'undo:button', 'status:div', 'hiddenInput:input'], inputs: ['value:stroke[]', 'defaultValue:stroke[]', 'name:string', 'disabled:boolean', 'readOnly:boolean', 'required:boolean'], events: ['POINTER_START', 'POINTER_MOVE', 'POINTER_END', 'POINTER_CANCEL', 'UNDO', 'CLEAR', 'FORM_RESET'], states: ['empty', 'drawing', 'complete'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE', 'multiple'), form: 'scalar', domServices: [D.root, D.formLive],
  }),
  define('Slider', {
    family: 'range-gesture', requirements: ['PRIM-006'],
    anatomy: ['root:div', 'label:label', 'control:div', 'track:div', 'range:div', 'thumb:div:many', 'valueText:span:many', 'hiddenInput:input:many'], inputs: ['value:number[]', 'defaultValue:number[]', 'min:number', 'max:number', 'step:number', 'minStepsBetweenThumbs:number', 'orientation:string', 'dir:string', 'name:string', 'disabled:boolean', 'readOnly:boolean'], events: ['POINTER_START', 'POINTER_MOVE', 'POINTER_END', 'POINTER_CANCEL', 'KEY_STEP', 'SET_VALUE', 'FORM_RESET'], states: ['idle', 'dragging', 'focused'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE', 'multiple'), form: 'multiple', domServices: [D.root, D.formLive],
  }),
  define('Splitter', {
    family: 'range-gesture', requirements: ['PRIM-006'],
    anatomy: ['root:div', 'panel:div:many', 'resizeTrigger:div:many', 'resizeHandle:div:many'], inputs: ['sizes:number[]', 'defaultSizes:number[]', 'minSizes:number[]', 'maxSizes:number[]', 'orientation:string', 'dir:string', 'disabled:boolean'], events: ['RESIZE_START', 'RESIZE_MOVE', 'RESIZE_END', 'RESIZE_CANCEL', 'KEY_RESIZE', 'COLLAPSE', 'EXPAND'], states: ['idle', 'resizing'],
    controlledModel: controlled('sizes', 'defaultSizes', 'SIZES_CHANGE', 'multiple'), domServices: [D.root],
  }),
  define('Steps', {
    family: 'status-feedback', requirements: ['PRIM-008'],
    anatomy: ['root:nav', 'list:ol', 'item:li:many', 'trigger:button:many', 'indicator:span:many', 'separator:span:many', 'content:div:many', 'completed:span:many'], inputs: ['step:number', 'defaultStep:number', 'count!:number', 'orientation:string', 'linear:boolean'], events: ['NEXT', 'PREVIOUS', 'GO_TO', 'COMPLETE'], states: ['idle', 'in-progress', 'complete'],
    controlledModel: controlled('step', 'defaultStep', 'STEP_CHANGE'), domServices: [D.root, D.formLive],
  }),
  define('Switch', {
    family: 'forms-input', requirements: ['PRIM-004'],
    anatomy: ['root:label', 'control:button', 'thumb:span', 'label:span', 'hiddenInput:input'], inputs: ['checked:boolean', 'defaultChecked:boolean', 'name:string', 'value:string', 'disabled:boolean', 'readOnly:boolean', 'required:boolean'], events: ['TOGGLE', 'SET_CHECKED', 'FORM_RESET'], states: ['unchecked', 'checked'],
    controlledModel: controlled('checked', 'defaultChecked', 'CHECKED_CHANGE'), form: 'scalar', domServices: [D.root, D.formLive],
  }),
  define('Tabs', {
    family: 'menu-navigation', requirements: ['PRIM-003'],
    anatomy: ['root:div', 'list:div', 'trigger:button:many', 'content:div:many', 'indicator:div'], inputs: ['value:string', 'defaultValue:string', 'activationMode:string', 'orientation:string', 'loop:boolean', 'dir:string'], events: ['FOCUS_TAB', 'NAVIGATE', 'ACTIVATE', 'SET_VALUE'], states: ['idle', 'focused', 'selected'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE'), domServices: [D.root],
  }),
  define('TagsInput', {
    family: 'selection-collection', requirements: ['PRIM-004'],
    anatomy: ['root:div', 'label:label', 'control:div', 'item:span:many', 'itemText:span:many', 'itemDelete:button:many', 'input:input', 'clear:button', 'hiddenInput:input:many', 'error:div'], inputs: ['value:string[]', 'defaultValue:string[]', 'allowDuplicates:boolean', 'max:number', 'delimiter:string', 'name:string', 'disabled:boolean', 'readOnly:boolean', 'required:boolean'], events: ['INPUT', 'COMPOSITION_START', 'COMPOSITION_END', 'ADD', 'REMOVE', 'NAVIGATE_TAG', 'CLEAR', 'FORM_RESET'], states: ['idle', 'editing', 'invalid'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE', 'multiple'), form: 'multiple', domServices: [D.root, D.formLive],
  }),
  define('Timer', {
    family: 'status-feedback', requirements: ['PRIM-007'],
    anatomy: ['root:div', 'value:time', 'start:button', 'pause:button', 'reset:button', 'status:span'], inputs: ['duration!:number', 'remaining:number', 'defaultRemaining:number', 'direction:string', 'autoStart:boolean', 'announceInterval:number'], events: ['START', 'PAUSE', 'RESUME', 'RESET', 'TICK', 'VISIBILITY_CHANGE'], states: ['idle', 'running', 'paused', 'complete'],
    controlledModel: controlled('remaining', 'defaultRemaining', 'REMAINING_CHANGE'), domServices: [D.root, D.formLive],
  }),
  define('Toast', {
    family: 'status-feedback', requirements: ['PRIM-008'],
    anatomy: ['viewport:div', 'root:div:many', 'title:div:many', 'description:div:many', 'action:button:many', 'close:button:many'],
    inputs: ['toasts:toast[]', 'limit:number', 'duration:number', 'placement:string', 'pauseOnHover:boolean', 'pauseOnFocus:boolean', 'duplicatePolicy:string', 'messages:object', 'onDismiss:function', 'onRemove:function', 'onAnnounce:function'],
    events: ['ADD', 'UPDATE', 'DISMISS', 'REMOVE', 'PAUSE', 'RESUME', 'SWIPE_START', 'SWIPE_MOVE', 'SWIPE_END', 'SWIPE_CANCEL', 'ROUTE_CHANGE'], states: ['idle', 'visible', 'paused', 'swiping', 'exiting'],
    domServices: [D.root, D.portal, D.formLive],
  }),
  define('Toggle', {
    family: 'selection-collection', requirements: ['PRIM-004'],
    anatomy: ['root:button'], inputs: ['pressed:boolean', 'defaultPressed:boolean', 'disabled:boolean'], events: ['TOGGLE', 'SET_PRESSED'], states: ['off', 'on'],
    controlledModel: controlled('pressed', 'defaultPressed', 'PRESSED_CHANGE'), domServices: [D.root],
  }),
  define('ToggleGroup', {
    family: 'selection-collection', requirements: ['PRIM-004'],
    anatomy: ['root:div', 'item:button:many'], inputs: ['value:string[]', 'defaultValue:string[]', 'type:string', 'orientation:string', 'loop:boolean', 'disabled:boolean'], events: ['NAVIGATE', 'TOGGLE_ITEM', 'SET_VALUE'], states: ['idle', 'focused', 'selected'],
    controlledModel: controlled('value', 'defaultValue', 'VALUE_CHANGE', 'single-or-multiple'), domServices: [D.root],
  }),
  define('Toolbar', {
    family: 'menu-navigation', requirements: ['PRIM-001'],
    anatomy: ['root:div', 'button:button:many', 'link:a:many', 'toggleGroup:div:many', 'separator:div:many'], inputs: ['orientation:string', 'loop:boolean', 'dir:string', 'disabled:boolean'], events: ['FOCUS_ITEM', 'NAVIGATE', 'ACTIVATE'], states: ['idle', 'focused'], domServices: [D.root],
  }),
  define('Tooltip', {
    family: 'modal-overlay', requirements: ['PRIM-002'],
    anatomy: ['root:span', 'trigger:button', 'positioner:div', 'content:div', 'arrow:div'], inputs: ['open:boolean', 'defaultOpen:boolean', 'openDelay:number', 'closeDelay:number', 'placement:string', 'disabled:boolean'], events: ['POINTER_ENTER', 'POINTER_LEAVE', 'FOCUS', 'BLUR', 'OPEN', 'CLOSE', 'ESCAPE'], states: ['closed', 'opening-delay', 'open', 'closing-delay'],
    controlledModel: controlled('open', 'defaultOpen', 'OPEN_CHANGE'), domServices: [D.root, D.layer, D.position, D.portal], accessibilityNotes: ['Content supplies a description relationship and never replaces the trigger accessible name by accident.'],
  }),
  define('Tour', {
    family: 'modal-overlay', requirements: ['PRIM-002'],
    anatomy: ['root:div', 'portal:div', 'backdrop:div', 'spotlight:div', 'positioner:div', 'content:div', 'title:heading', 'description:p', 'previous:button', 'next:button', 'skip:button', 'close:button', 'progress:div'], inputs: ['open:boolean', 'defaultOpen:boolean', 'step:number', 'defaultStep:number', 'steps!:tour-step[]', 'modal:boolean'], events: ['OPEN', 'CLOSE', 'NEXT', 'PREVIOUS', 'GO_TO', 'SKIP', 'TARGET_MISSING'], states: ['closed', 'locating', 'open', 'transitioning', 'complete'],
    controlledModel: { mode: 'compound', valueInputs: ['open', 'step'], defaultInputs: ['defaultOpen', 'defaultStep'], changeEvents: ['OPEN_CHANGE', 'STEP_CHANGE'] }, domServices: [D.root, D.layer, D.focus, D.modal, D.position, D.portal, D.formLive],
  }),
  define('TreeView', {
    family: 'selection-collection', requirements: ['PRIM-003', 'PRIM-008'],
    anatomy: ['root:div', 'label:span', 'tree:div', 'item:div:many', 'itemTrigger:button:many', 'itemText:span:many', 'branch:div:many', 'indicator:span:many'], inputs: ['expanded:string[]', 'defaultExpanded:string[]', 'selection:unknown', 'defaultSelection:unknown', 'items!:tree-node[]', 'selectionMode:string', 'dir:string'], events: ['FOCUS_ITEM', 'NAVIGATE', 'TYPEAHEAD', 'EXPAND', 'COLLAPSE', 'SELECT', 'LOAD_CHILDREN'], states: ['idle', 'focused', 'loading', 'expanded'],
    controlledModel: { mode: 'compound', valueInputs: ['expanded', 'selection'], defaultInputs: ['defaultExpanded', 'defaultSelection'], changeEvents: ['EXPANDED_CHANGE', 'SELECTION_CHANGE'] }, domServices: [D.root, D.formLive],
  }),
  define('Badge', {
    family: 'static-foundation', requirements: ['PRIM-001'], kind: 'typed-static-contract',
    anatomy: ['root:span'], inputs: ['variant:string'], events: [], states: ['idle'],
  }),
  define('Breadcrumb', {
    family: 'static-foundation', requirements: ['PRIM-001'], kind: 'typed-static-contract',
    anatomy: ['root:nav', 'list:ol', 'item:li:many', 'link:a:many', 'page:span', 'separator:li:many', 'ellipsis:span'],
    inputs: ['label:string'], events: [], states: ['idle'],
    accessibilityNotes: ['The root is a labelled navigation landmark and the current page uses aria-current="page".', 'Separators are decorative and hidden from assistive technology.'],
  }),
  define('Card', {
    family: 'static-foundation', requirements: ['PRIM-001'], kind: 'typed-static-contract',
    anatomy: ['root:div', 'header:div', 'title:h3', 'description:p', 'action:div', 'content:div', 'footer:div'],
    inputs: ['elevated:boolean'], events: [], states: ['idle'],
  }),
  define('Command', {
    family: 'selection-collection', requirements: ['PRIM-004'],
    anatomy: ['root:div', 'label:label', 'input:input', 'list:div', 'empty:div', 'loading:div', 'group:div:many', 'groupHeading:div:many', 'item:div:many', 'itemIndicator:span:many', 'separator:div:many', 'shortcut:kbd:many', 'hiddenInput:input'],
    inputs: ['value:unknown', 'defaultValue:unknown', 'inputValue:string', 'defaultInputValue:string', 'items:unknown[]', 'multiple:boolean', 'loop:boolean', 'name:string', 'disabled:boolean', 'readOnly:boolean', 'required:boolean', 'placeholder:string'],
    events: ['INPUT', 'COMPOSITION_START', 'COMPOSITION_END', 'NAVIGATE', 'SELECT', 'CLEAR', 'FORM_RESET'],
    states: ['idle', 'composing', 'loading', 'empty', 'selected'],
    controlledModel: {
      mode: 'compound',
      valueInputs: ['value', 'inputValue'],
      defaultInputs: ['defaultValue', 'defaultInputValue'],
      changeEvents: ['VALUE_CHANGE', 'INPUT_VALUE_CHANGE'],
    },
    form: 'multiple', domServices: [D.root, D.formLive],
    accessibilityNotes: ['The input owns combobox semantics and points to the command list with aria-controls.', 'Keyboard navigation skips disabled items and preserves composition input.'],
  }),
  define('InputGroup', {
    family: 'forms-input', requirements: ['PRIM-001'], kind: 'typed-static-contract',
    anatomy: ['root:div', 'addon:div:many', 'text:span:many', 'control:div', 'input:input', 'textarea:textarea', 'button:button:many'],
    inputs: ['disabled:boolean', 'invalid:boolean'], events: [], states: ['valid', 'invalid', 'disabled'],
    form: 'native', domServices: [D.formLive],
  }),
  define('Skeleton', {
    family: 'status-feedback', requirements: ['PRIM-001'], kind: 'typed-static-contract',
    anatomy: ['root:div'], inputs: ['visible:boolean'], events: [], states: ['loading', 'hidden'],
    accessibilityNotes: ['Skeleton geometry is decorative and hidden from the accessibility tree.', 'The owning content region is responsible for announcing busy state when appropriate.'],
  }),
  define('Table', {
    family: 'static-foundation', requirements: ['PRIM-001'], kind: 'typed-static-contract',
    anatomy: ['root:div', 'table:table', 'header:thead', 'body:tbody', 'footer:tfoot', 'row:tr:many', 'head:th:many', 'cell:td:many', 'caption:caption'],
    inputs: ['striped:boolean'], events: [], states: ['idle'],
    accessibilityNotes: ['The semantic table, sections, rows, header cells, data cells, and caption are preserved.', 'Consumers must provide meaningful column headers and a caption or external accessible name.'],
  }),
  define('Textarea', {
    family: 'forms-input', requirements: ['PRIM-001'], kind: 'typed-static-contract',
    anatomy: ['root:textarea'],
    inputs: ['value:string', 'defaultValue:string', 'name:string', 'placeholder:string', 'rows:number', 'disabled:boolean', 'readOnly:boolean', 'required:boolean', 'invalid:boolean', 'resize:string'],
    events: [], states: ['valid', 'invalid', 'disabled'],
    controlledModel: nativeControlled('value'), form: 'native', domServices: [D.formLive],
  }),
];

primitiveDefinitions.forEach((primitive, index) => {
  primitive.canonicalOrder = index + 1;
});

export const CATALOG_SOURCE = {
  schemaVersion: CATALOG_SCHEMA_VERSION,
  catalogId: 'uifn-ga-catalog',
  catalogVersion: CATALOG_VERSION,
  generatorVersion: GENERATOR_VERSION,
  sourcePolicy: 'clean-room-original-definition',
  packageGraphId: 'uifn-1.0-stable-dag',
  frameworks: [...STABLE_FRAMEWORKS],
  implementationStatusPolicy: {
    allowedCurrentStatus: 'implemented',
    generatedMetadataIsImplementationEvidence: true,
  },
  primitives: primitiveDefinitions,
};
