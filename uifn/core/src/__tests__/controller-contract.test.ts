import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { UIFnError } from '../errors';
import { createUIFnEnvironment, createUIFnIdAllocator } from '../environment';
import { mergePartProps, type UIFnPartProps } from '../parts';
import {
  createAccordionController,
  createAlertDialogController,
  createAutocompleteController,
  createCheckboxController,
  createCheckboxGroupController,
  createClipboardController,
  createCollapsibleController,
  createComboboxController,
  createContextMenuController,
  createDialogController,
  createDrawerController,
  createEditableController,
  createFileUploadController,
  createMenuController,
  createFloatingPanelController,
  createHoverCardController,
  createImageCropperController,
  createListboxController,
  createMenubarController,
  createNavigationMenuController,
  createNumberInputController,
  createPaginationController,
  createPasswordInputController,
  createPinInputController,
  createPopoverController,
  createProgressController,
  createRadioGroupController,
  createScrollAreaController,
  createSegmentGroupController,
  createSelectController,
  createSliderController,
  createSwitchController,
  createTabsController,
  createTagsInputController,
  createTreeViewController,
  createToastController,
  createToggleController,
  createToggleGroupController,
  createToolbarController,
  createTooltipController,
  createTourController,
} from '../primitives';

interface ContractController {
  readonly status: string;
  readonly state: unknown;
  readonly snapshot: unknown;
  readonly actions: Record<string, (...args: any[]) => any>;
  readonly parts: object;
  getState: () => unknown;
  getSnapshot: () => unknown;
  update: (inputs: any) => void;
  subscribe: (subscriber: (state: unknown, meta?: unknown) => void) => () => void;
  destroy: () => void;
}

type PartSampler = (controller: ContractController, userProps?: UIFnPartProps) => UIFnPartProps;

interface ControllerCase {
  primitive: string;
  controller: string;
  create: () => ContractController;
  interact: ((controller: ContractController) => void) | null;
  samples: PartSampler[];
}

let deterministicInstance = 0;
const envFor = (primitive: string) => {
  deterministicInstance += 1;
  const instance = deterministicInstance;
  return {
    generateId: (scope: string) => `${scope}-${primitive.toLowerCase()}-${instance}`,
  };
};

const controllerCases: ControllerCase[] = [
  {
    primitive: 'Accordion',
    controller: 'createAccordionController',
    create: () => createAccordionController({ items: ['one', 'two'], defaultValue: 'one' }, envFor('accordion')),
    interact: (controller) => controller.actions.toggleItem('two'),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.item.getProps('one', props),
      (controller, props) => controller.parts.header.getProps('one', props),
      (controller, props) => controller.parts.trigger.getProps('one', props),
      (controller, props) => controller.parts.content.getProps('one', props),
    ],
  },
  {
    primitive: 'AlertDialog',
    controller: 'createAlertDialogController',
    create: () => createAlertDialogController({ defaultOpen: true }, envFor('alert-dialog')),
    interact: (controller) => controller.actions.close(),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.trigger.getProps(props),
      (controller, props) => controller.parts.portal.getProps(props),
      (controller, props) => controller.parts.backdrop.getProps(props),
      (controller, props) => controller.parts.positioner.getProps(props),
      (controller, props) => controller.parts.content.getProps(props),
      (controller, props) => controller.parts.title.getProps(props),
      (controller, props) => controller.parts.description.getProps(props),
      (controller, props) => controller.parts.cancel.getProps(props),
      (controller, props) => controller.parts.action.getProps(props),
      (controller, props) => controller.parts.close.getProps(props),
    ],
  },
  {
    primitive: 'Autocomplete',
    controller: 'createAutocompleteController',
    create: () => createAutocompleteController({ items: ['alpha', 'beta'] }, envFor('autocomplete')),
    interact: (controller) => controller.actions.select('beta'),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.label.getProps(props),
      (controller, props) => controller.parts.control.getProps(props),
      (controller, props) => controller.parts.input.getProps(props),
      (controller, props) => controller.parts.clear.getProps(props),
      (controller, props) => controller.parts.positioner.getProps(props),
      (controller, props) => controller.parts.content.getProps(props),
      (controller, props) => controller.parts.item.getProps('alpha', props),
      (controller, props) => controller.parts.empty.getProps(props),
    ],
  },
  {
    primitive: 'Checkbox',
    controller: 'createCheckboxController',
    create: () => createCheckboxController({}, envFor('checkbox')),
    interact: (controller) => controller.actions.toggle(),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.control.getProps(props),
      (controller, props) => controller.parts.indicator.getProps(props),
      (controller, props) => controller.parts.label.getProps(props),
      (controller, props) => controller.parts.hiddenInput.getProps(props),
    ],
  },
  {
    primitive: 'CheckboxGroup',
    controller: 'createCheckboxGroupController',
    create: () => createCheckboxGroupController({ items: ['alpha', 'beta'], defaultValue: ['alpha'] }, envFor('checkbox-group')),
    interact: (controller) => controller.actions.setValue(['alpha', 'beta']),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.label.getProps(props),
      (controller, props) => controller.parts.item.getProps('alpha', props),
      (controller, props) => controller.parts.itemControl.getProps('alpha', props),
      (controller, props) => controller.parts.itemIndicator.getProps('alpha', props),
      (controller, props) => controller.parts.hiddenInput.getProps('alpha', props),
      (controller, props) => controller.parts.error.getProps(props),
    ],
  },
  {
    primitive: 'Clipboard',
    controller: 'createClipboardController',
    create: () => createClipboardController({ capability: { writeText: async () => {} } }, envFor('clipboard')),
    interact: (controller) => { void controller.actions.copy('public-value'); },
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.trigger.getProps(props),
      (controller, props) => controller.parts.status.getProps(props),
    ],
  },
  {
    primitive: 'Collapsible',
    controller: 'createCollapsibleController',
    create: () => createCollapsibleController({ defaultOpen: true }, envFor('collapsible')),
    interact: (controller) => controller.actions.toggle(),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.trigger.getProps(props),
      (controller, props) => controller.parts.content.getProps(props),
    ],
  },
  {
    primitive: 'Combobox',
    controller: 'createComboboxController',
    create: () =>
      createComboboxController(
        { items: ['alpha', 'beta'], defaultValue: 'alpha', defaultOpen: true },
        envFor('combobox')
      ),
    interact: (controller) => controller.actions.setOpen(false),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.label.getProps(props),
      (controller, props) => controller.parts.control.getProps(props),
      (controller, props) => controller.parts.input.getProps(props),
      (controller, props) => controller.parts.trigger.getProps(props),
      (controller, props) => controller.parts.clear.getProps(props),
      (controller, props) => controller.parts.positioner.getProps(props),
      (controller, props) => controller.parts.content.getProps(props),
      (controller, props) => controller.parts.item.getProps('alpha', props),
      (controller, props) => controller.parts.itemIndicator.getProps('alpha', props),
      (controller, props) => controller.parts.empty.getProps(props),
      (controller, props) => controller.parts.hiddenInput.getProps(props),
    ],
  },
  {
    primitive: 'ContextMenu',
    controller: 'createContextMenuController',
    create: () =>
      createContextMenuController(
        { items: [{ id: 'copy' }, { id: 'advanced' }, { id: 'nested', parentId: 'advanced' }] },
        envFor('context-menu')
      ),
    interact: (controller) => controller.actions.setOpen(true),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.trigger.getProps(props),
      (controller, props) => controller.parts.positioner.getProps(props),
      (controller, props) => controller.parts.content.getProps(props),
      (controller, props) => controller.parts.item.getProps('copy', props),
      (controller, props) => controller.parts.itemIndicator.getProps('copy', props),
      (controller, props) => controller.parts.group.getProps('main', props),
      (controller, props) => controller.parts.groupLabel.getProps('main', props),
      (controller, props) => controller.parts.separator.getProps('primary', props),
      (controller, props) => controller.parts.submenuTrigger.getProps('advanced', props),
      (controller, props) => controller.parts.submenuContent.getProps('advanced', props),
    ],
  },
  {
    primitive: 'Dialog',
    controller: 'createDialogController',
    create: () => createDialogController({ defaultOpen: true }, envFor('dialog')),
    interact: (controller) => controller.actions.close(),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.trigger.getProps(props),
      (controller, props) => controller.parts.portal.getProps(props),
      (controller, props) => controller.parts.backdrop.getProps(props),
      (controller, props) => controller.parts.positioner.getProps(props),
      (controller, props) => controller.parts.content.getProps(props),
      (controller, props) => controller.parts.title.getProps(props),
      (controller, props) => controller.parts.description.getProps(props),
      (controller, props) => controller.parts.close.getProps(props),
    ],
  },
  {
    primitive: 'Drawer',
    controller: 'createDrawerController',
    create: () => createDrawerController({ defaultOpen: true }, envFor('drawer')),
    interact: (controller) => controller.actions.close(),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.trigger.getProps(props),
      (controller, props) => controller.parts.portal.getProps(props),
      (controller, props) => controller.parts.backdrop.getProps(props),
      (controller, props) => controller.parts.positioner.getProps(props),
      (controller, props) => controller.parts.content.getProps(props),
      (controller, props) => controller.parts.handle.getProps(props),
      (controller, props) => controller.parts.title.getProps(props),
      (controller, props) => controller.parts.description.getProps(props),
      (controller, props) => controller.parts.close.getProps(props),
    ],
  },
  {
    primitive: 'Editable',
    controller: 'createEditableController',
    create: () => createEditableController({ defaultValue: 'draft' }, envFor('editable')),
    interact: (controller) => controller.actions.startEditing(),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.label.getProps(props),
      (controller, props) => controller.parts.preview.getProps(props),
      (controller, props) => controller.parts.input.getProps(props),
      (controller, props) => controller.parts.control.getProps(props),
      (controller, props) => controller.parts.submit.getProps(props),
      (controller, props) => controller.parts.cancel.getProps(props),
      (controller, props) => controller.parts.error.getProps(props),
      (controller, props) => controller.parts.hiddenInput.getProps(props),
    ],
  },
  {
    primitive: 'FileUpload',
    controller: 'createFileUploadController',
    create: () => createFileUploadController({ accept: 'text/plain' }, envFor('file-upload')),
    interact: (controller) => controller.actions.selectFiles([{ name: 'readme.txt', size: 12, type: 'text/plain' }]),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.label.getProps(props),
      (controller, props) => controller.parts.dropzone.getProps(props),
      (controller, props) => controller.parts.trigger.getProps(props),
      (controller, props) => controller.parts.input.getProps(props),
      (controller, props) => controller.parts.itemGroup.getProps(props),
      (controller, props) => controller.parts.item.getProps(0, props),
      (controller, props) => controller.parts.itemName.getProps(0, props),
      (controller, props) => controller.parts.itemSize.getProps(0, props),
      (controller, props) => controller.parts.itemDelete.getProps(0, props),
      (controller, props) => controller.parts.error.getProps(props),
      (controller, props) => controller.parts.status.getProps(props),
    ],
  },
  {
    primitive: 'Menu',
    controller: 'createMenuController',
    create: () =>
      createMenuController(
        { defaultOpen: true, items: [{ id: 'copy' }, { id: 'advanced' }, { id: 'nested', parentId: 'advanced' }] },
        envFor('menu')
      ),
    interact: (controller) => controller.actions.setOpen(false),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.trigger.getProps(props),
      (controller, props) => controller.parts.positioner.getProps(props),
      (controller, props) => controller.parts.content.getProps(props),
      (controller, props) => controller.parts.item.getProps('copy', props),
      (controller, props) => controller.parts.itemIndicator.getProps('copy', props),
      (controller, props) => controller.parts.group.getProps('main', props),
      (controller, props) => controller.parts.groupLabel.getProps('main', props),
      (controller, props) => controller.parts.separator.getProps('primary', props),
      (controller, props) => controller.parts.submenuTrigger.getProps('advanced', props),
      (controller, props) => controller.parts.submenuContent.getProps('advanced', props),
    ],
  },
  {
    primitive: 'FloatingPanel',
    controller: 'createFloatingPanelController',
    create: () => createFloatingPanelController({ defaultOpen: true }, envFor('floating-panel')),
    interact: (controller) => controller.actions.close(),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.trigger.getProps(props),
      (controller, props) => controller.parts.positioner.getProps(props),
      (controller, props) => controller.parts.content.getProps(props),
      (controller, props) => controller.parts.header.getProps(props),
      (controller, props) => controller.parts.title.getProps(props),
      (controller, props) => controller.parts.description.getProps(props),
      (controller, props) => controller.parts.dragHandle.getProps(props),
      (controller, props) => controller.parts.resizeHandle.getProps('east', props),
      (controller, props) => controller.parts.close.getProps(props),
    ],
  },
  {
    primitive: 'HoverCard',
    controller: 'createHoverCardController',
    create: () => createHoverCardController({ defaultOpen: true, openDelay: 0 }, envFor('hover-card')),
    interact: (controller) => controller.actions.close(),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.trigger.getProps(props),
      (controller, props) => controller.parts.positioner.getProps(props),
      (controller, props) => controller.parts.content.getProps(props),
      (controller, props) => controller.parts.arrow.getProps(props),
    ],
  },
  {
    primitive: 'ImageCropper',
    controller: 'createImageCropperController',
    create: () => createImageCropperController({ src: '/image.png' }, envFor('image-cropper')),
    interact: (controller) => controller.actions.load(800, 600),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.viewport.getProps(props),
      (controller, props) => controller.parts.image.getProps(props),
      (controller, props) => controller.parts.cropArea.getProps(props),
      (controller, props) => controller.parts.handle.getProps('se', props),
      (controller, props) => controller.parts.zoomControl.getProps(props),
      (controller, props) => controller.parts.status.getProps(props),
    ],
  },
  {
    primitive: 'Listbox',
    controller: 'createListboxController',
    create: () => createListboxController({ items: ['alpha', 'beta'], defaultValue: 'alpha' }, envFor('listbox')),
    interact: (controller) => controller.actions.setValue('beta'),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.label.getProps(props),
      (controller, props) => controller.parts.content.getProps(props),
      (controller, props) => controller.parts.item.getProps('alpha', props),
      (controller, props) => controller.parts.itemIndicator.getProps('alpha', props),
      (controller, props) => controller.parts.group.getProps('main', props),
      (controller, props) => controller.parts.groupLabel.getProps('main', props),
      (controller, props) => controller.parts.hiddenInput.getProps(props),
    ],
  },
  {
    primitive: 'Menubar',
    controller: 'createMenubarController',
    create: () => createMenubarController({ items: [{ id: 'file' }, { id: 'edit' }, { id: 'new', parentId: 'file' }], defaultValue: 'file' }, envFor('menubar')),
    interact: (controller) => controller.actions.setValue('edit'),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.menu.getProps('file', props),
      (controller, props) => controller.parts.trigger.getProps('file', props),
      (controller, props) => controller.parts.content.getProps('file', props),
      (controller, props) => controller.parts.item.getProps('file', props),
      (controller, props) => controller.parts.submenuTrigger.getProps('file', props),
      (controller, props) => controller.parts.submenuContent.getProps('file', props),
    ],
  },
  {
    primitive: 'NavigationMenu',
    controller: 'createNavigationMenuController',
    create: () => createNavigationMenuController({ items: [{ id: 'docs', hasContent: true }, { id: 'blog', href: '/blog' }] }, envFor('navigation-menu')),
    interact: (controller) => controller.actions.setValue('docs'),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.list.getProps(props),
      (controller, props) => controller.parts.item.getProps('docs', props),
      (controller, props) => controller.parts.trigger.getProps('docs', props),
      (controller, props) => controller.parts.content.getProps('docs', props),
      (controller, props) => controller.parts.link.getProps('blog', props),
      (controller, props) => controller.parts.viewport.getProps(props),
      (controller, props) => controller.parts.indicator.getProps(props),
    ],
  },
  {
    primitive: 'Pagination',
    controller: 'createPaginationController',
    create: () => createPaginationController({ count: 100, defaultPage: 2 }, envFor('pagination')),
    interact: (controller) => controller.actions.next(),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.list.getProps(props),
      (controller, props) => controller.parts.item.getProps(1, props),
      (controller, props) => controller.parts.pageTrigger.getProps(1, props),
      (controller, props) => controller.parts.previous.getProps(props),
      (controller, props) => controller.parts.next.getProps(props),
      (controller, props) => controller.parts.ellipsis.getProps('start', props),
    ],
  },
  {
    primitive: 'NumberInput',
    controller: 'createNumberInputController',
    create: () => createNumberInputController({ defaultValue: '1', step: 1 }, envFor('number-input')),
    interact: (controller) => controller.actions.increment(),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.label.getProps(props),
      (controller, props) => controller.parts.control.getProps(props),
      (controller, props) => controller.parts.input.getProps(props),
      (controller, props) => controller.parts.increment.getProps(props),
      (controller, props) => controller.parts.decrement.getProps(props),
      (controller, props) => controller.parts.scrubber.getProps(props),
      (controller, props) => controller.parts.hiddenInput.getProps(props),
      (controller, props) => controller.parts.error.getProps(props),
    ],
  },
  {
    primitive: 'Popover',
    controller: 'createPopoverController',
    create: () => createPopoverController({ defaultOpen: true }, envFor('popover')),
    interact: (controller) => controller.actions.setOpen(false),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.trigger.getProps(props),
      (controller, props) => controller.parts.anchor.getProps(props),
      (controller, props) => controller.parts.positioner.getProps(props),
      (controller, props) => controller.parts.content.getProps(props),
      (controller, props) => controller.parts.title.getProps(props),
      (controller, props) => controller.parts.description.getProps(props),
      (controller, props) => controller.parts.arrow.getProps(props),
      (controller, props) => controller.parts.close.getProps(props),
    ],
  },
  {
    primitive: 'PasswordInput',
    controller: 'createPasswordInputController',
    create: () => createPasswordInputController({ defaultValue: 'secret-value' }, envFor('password-input')),
    interact: (controller) => controller.actions.toggleVisibility(),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.label.getProps(props),
      (controller, props) => controller.parts.input.getProps(props),
      (controller, props) => controller.parts.visibilityTrigger.getProps(props),
      (controller, props) => controller.parts.strength.getProps(props),
      (controller, props) => controller.parts.error.getProps(props),
    ],
  },
  {
    primitive: 'PinInput',
    controller: 'createPinInputController',
    create: () => createPinInputController({ defaultValue: '12', length: 4 }, envFor('pin-input')),
    interact: (controller) => controller.actions.setValue('123'),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.label.getProps(props),
      (controller, props) => controller.parts.control.getProps(props),
      (controller, props) => controller.parts.input.getProps(0, props),
      (controller, props) => controller.parts.input.getProps(1, props),
      (controller, props) => controller.parts.hiddenInput.getProps(props),
      (controller, props) => controller.parts.error.getProps(props),
    ],
  },
  {
    primitive: 'Progress',
    controller: 'createProgressController',
    create: () => createProgressController({ defaultValue: 35 }, envFor('progress')),
    interact: (controller) => controller.actions.setValue(50),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.label.getProps(props),
      (controller, props) => controller.parts.track.getProps(props),
      (controller, props) => controller.parts.range.getProps(props),
      (controller, props) => controller.parts.circle.getProps(props),
      (controller, props) => controller.parts.valueText.getProps(props),
    ],
  },
  {
    primitive: 'RadioGroup',
    controller: 'createRadioGroupController',
    create: () => createRadioGroupController({ items: ['small', 'large'], defaultValue: 'small' }, envFor('radio-group')),
    interact: (controller) => controller.actions.setValue('large'),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.label.getProps(props),
      (controller, props) => controller.parts.item.getProps('small', props),
      (controller, props) => controller.parts.itemControl.getProps('small', props),
      (controller, props) => controller.parts.itemIndicator.getProps('small', props),
      (controller, props) => controller.parts.hiddenInput.getProps('small', props),
      (controller, props) => controller.parts.error.getProps(props),
    ],
  },
  {
    primitive: 'ScrollArea',
    controller: 'createScrollAreaController',
    create: () => {
      const controller = createScrollAreaController({}, envFor('scroll-area'));
      controller.actions.setViewportMetrics({
        clientHeight: 100,
        clientWidth: 100,
        scrollHeight: 300,
        scrollWidth: 240,
      });
      return controller;
    },
    interact: (controller) => controller.actions.onViewportScroll({ top: 25, left: 10 }),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.viewport.getProps(props),
      (controller, props) => controller.parts.scrollbar.getProps('vertical', props),
      (controller, props) => controller.parts.scrollbar.getProps('horizontal', props),
      (controller, props) => controller.parts.thumb.getProps('vertical', props),
      (controller, props) => controller.parts.thumb.getProps('horizontal', props),
      (controller, props) => controller.parts.corner.getProps(props),
    ],
  },
  {
    primitive: 'SegmentGroup',
    controller: 'createSegmentGroupController',
    create: () => createSegmentGroupController({ items: ['alpha', 'beta'], defaultValue: 'alpha' }, envFor('segment-group')),
    interact: (controller) => controller.actions.setValue('beta'),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.label.getProps(props),
      (controller, props) => controller.parts.item.getProps('alpha', props),
      (controller, props) => controller.parts.itemText.getProps('alpha', props),
      (controller, props) => controller.parts.indicator.getProps(props),
      (controller, props) => controller.parts.hiddenInput.getProps(props),
    ],
  },
  {
    primitive: 'Select',
    controller: 'createSelectController',
    create: () => createSelectController({ items: ['draft', 'published'], defaultValue: 'draft' }, envFor('select')),
    interact: (controller) => controller.actions.setOpen(true),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.label.getProps(props),
      (controller, props) => controller.parts.control.getProps(props),
      (controller, props) => controller.parts.trigger.getProps(props),
      (controller, props) => controller.parts.valueText.getProps(props),
      (controller, props) => controller.parts.clear.getProps(props),
      (controller, props) => controller.parts.positioner.getProps(props),
      (controller, props) => controller.parts.content.getProps(props),
      (controller, props) => controller.parts.item.getProps('draft', props),
      (controller, props) => controller.parts.itemText.getProps('draft', props),
      (controller, props) => controller.parts.itemIndicator.getProps('draft', props),
      (controller, props) => controller.parts.group.getProps('main', props),
      (controller, props) => controller.parts.groupLabel.getProps('main', props),
      (controller, props) => controller.parts.hiddenInput.getProps(props),
    ],
  },
  {
    primitive: 'Slider',
    controller: 'createSliderController',
    create: () => createSliderController({ defaultValue: [25, 75] }, envFor('slider')),
    interact: (controller) => controller.actions.setThumbValue(0, 30),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.track.getProps(props),
      (controller, props) => controller.parts.range.getProps(props),
      (controller, props) => controller.parts.thumb.getProps(0, props),
      (controller, props) => controller.parts.hiddenInput.getProps(0, props),
    ],
  },
  {
    primitive: 'Switch',
    controller: 'createSwitchController',
    create: () => createSwitchController({ defaultChecked: true }, envFor('switch')),
    interact: (controller) => controller.actions.toggle(),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.control.getProps(props),
      (controller, props) => controller.parts.thumb.getProps(props),
      (controller, props) => controller.parts.label.getProps(props),
      (controller, props) => controller.parts.hiddenInput.getProps(props),
    ],
  },
  {
    primitive: 'Tabs',
    controller: 'createTabsController',
    create: () => createTabsController({ items: ['overview', 'settings'], defaultValue: 'overview' }, envFor('tabs')),
    interact: (controller) => controller.actions.setValue('settings'),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.list.getProps(props),
      (controller, props) => controller.parts.trigger.getProps('overview', props),
      (controller, props) => controller.parts.content.getProps('overview', props),
      (controller, props) => controller.parts.indicator.getProps(props),
    ],
  },
  {
    primitive: 'TagsInput',
    controller: 'createTagsInputController',
    create: () => createTagsInputController({ defaultValue: ['alpha', 'beta'] }, envFor('tags-input')),
    interact: (controller) => controller.actions.clear(),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.label.getProps(props),
      (controller, props) => controller.parts.control.getProps(props),
      (controller, props) => controller.parts.item.getProps('alpha', props),
      (controller, props) => controller.parts.itemText.getProps('alpha', props),
      (controller, props) => controller.parts.itemDelete.getProps('alpha', props),
      (controller, props) => controller.parts.input.getProps(props),
      (controller, props) => controller.parts.clear.getProps(props),
      (controller, props) => controller.parts.hiddenInput.getProps('alpha', props),
      (controller, props) => controller.parts.error.getProps(props),
    ],
  },
  {
    primitive: 'TreeView',
    controller: 'createTreeViewController',
    create: () => createTreeViewController({ items: [{ id: 'docs', children: [{ id: 'intro' }] }] }, envFor('tree-view')),
    interact: (controller) => controller.actions.expand('docs'),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.label.getProps(props),
      (controller, props) => controller.parts.tree.getProps(props),
      (controller, props) => controller.parts.item.getProps('docs', props),
      (controller, props) => controller.parts.itemTrigger.getProps('docs', props),
      (controller, props) => controller.parts.itemText.getProps('docs', props),
      (controller, props) => controller.parts.branch.getProps('docs', props),
      (controller, props) => controller.parts.indicator.getProps('docs', props),
    ],
  },
  {
    primitive: 'Toast',
    controller: 'createToastController',
    create: () => createToastController({ toasts: [{ id: 'first', title: 'First' }], duration: 60_000 }, envFor('toast')),
    interact: (controller) => controller.actions.swipeStart('first'),
    samples: [
      (controller, props) => controller.parts.viewport.getProps(props),
      (controller, props) => controller.parts.root.getProps('first', props),
      (controller, props) => controller.parts.title.getProps('first', props),
      (controller, props) => controller.parts.description.getProps('first', props),
      (controller, props) => controller.parts.action.getProps('first', props),
      (controller, props) => controller.parts.close.getProps('first', props),
    ],
  },
  {
    primitive: 'Toggle',
    controller: 'createToggleController',
    create: () => createToggleController({ defaultPressed: true }, envFor('toggle')),
    interact: (controller) => controller.actions.toggle(),
    samples: [(controller, props) => controller.parts.root.getProps(props)],
  },
  {
    primitive: 'ToggleGroup',
    controller: 'createToggleGroupController',
    create: () => createToggleGroupController({ type: 'multiple', items: ['bold', 'italic'], defaultValue: ['bold'] }, envFor('toggle-group')),
    interact: (controller) => controller.actions.toggleItem('italic'),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.item.getProps('bold', props),
    ],
  },
  {
    primitive: 'Toolbar',
    controller: 'createToolbarController',
    create: () => createToolbarController({ items: [{ id: 'bold', group: 'format' }] }, envFor('toolbar')),
    interact: (controller) => controller.actions.focusItem(null),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.button.getProps('bold', props),
      (controller, props) => controller.parts.link.getProps('bold', props),
      (controller, props) => controller.parts.toggleGroup.getProps('format', props),
      (controller, props) => controller.parts.separator.getProps('format', props),
    ],
  },
  {
    primitive: 'Tooltip',
    controller: 'createTooltipController',
    create: () => createTooltipController({ defaultOpen: true, delayDuration: 0 }, envFor('tooltip')),
    interact: (controller) => controller.actions.close(),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.trigger.getProps(props),
      (controller, props) => controller.parts.positioner.getProps(props),
      (controller, props) => controller.parts.content.getProps(props),
      (controller, props) => controller.parts.arrow.getProps(props),
    ],
  },
  {
    primitive: 'Tour',
    controller: 'createTourController',
    create: () => createTourController({ defaultOpen: true, steps: [{ id: 'one', title: 'One', target: '#one' }] }, envFor('tour')),
    interact: (controller) => controller.actions.close(),
    samples: [
      (controller, props) => controller.parts.root.getProps(props),
      (controller, props) => controller.parts.portal.getProps(props),
      (controller, props) => controller.parts.backdrop.getProps(props),
      (controller, props) => controller.parts.spotlight.getProps(props),
      (controller, props) => controller.parts.positioner.getProps(props),
      (controller, props) => controller.parts.content.getProps(props),
      (controller, props) => controller.parts.title.getProps(props),
      (controller, props) => controller.parts.description.getProps(props),
      (controller, props) => controller.parts.previous.getProps(props),
      (controller, props) => controller.parts.next.getProps(props),
      (controller, props) => controller.parts.skip.getProps(props),
      (controller, props) => controller.parts.close.getProps(props),
      (controller, props) => controller.parts.progress.getProps(props),
    ],
  },
];

function adversarialPropsFor(generated: UIFnPartProps): UIFnPartProps {
  return {
    role: generated.role ? 'presentation' : undefined,
    id: generated.id ? 'user-id' : undefined,
    tabIndex: generated.tabIndex === undefined ? undefined : generated.tabIndex + 10,
    aria: Object.fromEntries(Object.keys(generated.aria ?? {}).map((key) => [key, null])),
    data: Object.fromEntries(Object.keys(generated.data ?? {}).map((key) => [key, 'user-value'])),
  };
}

describe('controller contract', () => {
  it('exposes canonical controller fields for every primitive controller', () => {
    controllerCases.forEach((entry) => {
      const controller = entry.create();
      const notifications: unknown[] = [];
      const unsubscribe = controller.subscribe((state) => notifications.push(state));

      expect(controller.state, entry.primitive).toBe(controller.getState());
      expect(controller.snapshot, entry.primitive).toBe(controller.getSnapshot());
      expect(controller.status, entry.primitive).toBe('running');
      expect(typeof controller.actions, entry.primitive).toBe('object');
      expect(typeof controller.parts, entry.primitive).toBe('object');
      expect(typeof controller.getState, entry.primitive).toBe('function');
      expect(typeof controller.subscribe, entry.primitive).toBe('function');
      expect(typeof controller.update, entry.primitive).toBe('function');
      expect(typeof controller.destroy, entry.primitive).toBe('function');

      expect(notifications, `${entry.primitive} initial subscription`).toHaveLength(1);
      controller.update({});
      expect(notifications, `${entry.primitive} empty input update`).toHaveLength(1);
      entry.samples[0]?.(controller);
      if (entry.interact) {
        expect(Object.keys(controller.actions), `${entry.primitive} actions`).not.toHaveLength(0);
        entry.interact(controller);
        expect(notifications, `${entry.primitive} canonical action`).toHaveLength(2);
      } else {
        expect(Object.keys(controller.actions), `${entry.primitive} static actions`).toHaveLength(0);
      }

      unsubscribe();
      controller.destroy();
      controller.destroy();
      expect(controller.status, entry.primitive).toBe('destroyed');
      expect(() => controller.update({}), entry.primitive).toThrowError(UIFnError);
    });
  });

  it('keeps the implemented controller inventory unique', () => {
    const names = controllerCases.map((entry) => entry.controller);
    expect(new Set(names).size).toBe(names.length);
  });

  it('generates non-empty part props for the full primitive anatomy inventory', () => {
    controllerCases.forEach((entry) => {
      const controller = entry.create();

      entry.samples.forEach((sample) => {
        const props = sample(controller);
        expect(props.id ?? props.role ?? props.data, entry.primitive).toBeTruthy();
      });

      controller.destroy();
    });
  });

  it('preserves declared controller part invariants without freezing arbitrary data', () => {
    controllerCases.forEach((entry) => {
      const controller = entry.create();

      entry.samples.forEach((sample) => {
        const generated = sample(controller);
        const merged = sample(controller, adversarialPropsFor(generated));

        if (generated.id) {
          expect(merged.id, `${entry.primitive} id`).toBe(generated.id);
        }
        expect(merged.warnings, entry.primitive).toContain('UIFN_PART_INVARIANT_OVERRIDDEN');
      });

      controller.destroy();
    });
  });

  it('preserves required accessibility props when user props conflict', () => {
    const merged = mergePartProps(
      {
        role: 'tab',
        aria: {
          selected: true,
        },
      },
      {
        role: 'button',
        aria: {
          selected: null,
        },
      },
      {
        component: 'Tabs',
        part: 'trigger',
        required: {
          role: true,
          aria: ['selected'],
        },
      }
    );

    expect(merged.role).toBe('tab');
    expect(merged.aria).toEqual({ selected: true });
    expect(merged.warnings).toEqual(['UIFN_PART_INVARIANT_OVERRIDDEN']);
  });

  it('throws when required accessibility metadata is missing', () => {
    expect(() =>
      mergePartProps(
        {},
        {},
        {
          component: 'Tabs',
          part: 'trigger',
          required: {
            role: true,
          },
        }
      )
    ).toThrowError(UIFnError);

    try {
      mergePartProps(
        {},
        {},
        {
          component: 'Tabs',
          part: 'trigger',
          required: {
            role: true,
          },
        }
      );
    } catch (error) {
      expect(error).toBeInstanceOf(UIFnError);
      expect((error as UIFnError).code).toBe('UIFN_REQUIRED_A11Y_PROP_MISSING');
    }
  });

  it('rejects duplicate ids from a single controller environment', () => {
    expect(() =>
      createDialogController(
        { defaultOpen: false },
        {
          generateId: () => 'fixed',
          issuedIds: ['dialog-content-fixed'],
        }
      )
    ).toThrowError(UIFnError);

    try {
      createDialogController(
        { defaultOpen: false },
        {
          generateId: () => 'fixed',
          issuedIds: ['dialog-content-fixed'],
        }
      );
    } catch (error) {
      expect(error).toBeInstanceOf(UIFnError);
      expect((error as UIFnError).code).toBe('UIFN_CORE_ENVIRONMENT_INVALID');
    }
  });

  it('allocates deterministic ids without framework dependencies', () => {
    const env = createUIFnEnvironment({ generateId: (scope) => `${scope}-fixed` });
    const allocator = createUIFnIdAllocator(env, 'ContractTest');

    expect(allocator.next('contract-trigger', 'trigger')).toBe('contract-trigger-trigger-fixed');
    expect(allocator.next('contract-content', 'content')).toBe('contract-content-content-fixed');
    expect(allocator.snapshot()).toEqual([
      'contract-content-content-fixed',
      'contract-trigger-trigger-fixed',
    ]);
  });

  it('keeps core primitives free of framework and Tailwind imports', () => {
    const primitivesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'primitives');
    const source = readdirSync(primitivesDir)
      .filter((file) => file.endsWith('.ts'))
      .map((file) => readFileSync(join(primitivesDir, file), 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/from ['"](?:react|react-dom|svelte|solid-js|tailwindcss)/);
    expect(source).not.toMatch(/require\(['"](?:react|react-dom|svelte|solid-js|tailwindcss)/);
  });

  it('omits select active descendant while the popup options are closed', () => {
    const controller = createSelectController(
      { items: ['apple', 'banana'], defaultValue: 'apple' },
      { generateId: () => 'fixed' }
    );

    expect(controller.parts.trigger.getProps().aria?.activedescendant).toBeUndefined();

    controller.actions.setOpen(true);

    expect(controller.parts.trigger.getProps().aria?.activedescendant).toBe(
      'select-root-fixed-item-apple'
    );

    controller.destroy();
  });
});
