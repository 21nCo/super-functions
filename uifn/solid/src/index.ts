export const solidPackage = {
  name: '@uifn/solid',
  layer: 'adapter',
  status: 'ga-candidate',
  sourcePolicy: 'clean-room',
} as const;

export * from './generated/accordion.jsx';
export * from './generated/alert-dialog.jsx';
export * from './generated/angle-slider.jsx';
export * from './generated/autocomplete.jsx';
export * from './generated/avatar.jsx';
export * from './generated/button.jsx';
export * from './generated/carousel.jsx';
export * from './generated/checkbox.jsx';
export * from './generated/checkbox-group.jsx';
export * from './generated/clipboard.jsx';
export * from './generated/collapsible.jsx';
export * from './generated/color-picker.jsx';
export * from './generated/combobox.jsx';
export * from './generated/context-menu.jsx';
export * from './generated/date-input.jsx';
export * from './generated/date-picker.jsx';
export * from './generated/dialog.jsx';
export * from './generated/drawer.jsx';
export * from './generated/editable.jsx';
export * from './generated/field.jsx';
export * from './generated/fieldset.jsx';
export * from './generated/file-upload.jsx';
export * from './generated/floating-panel.jsx';
export * from './generated/form.jsx';
export * from './generated/hover-card.jsx';
export * from './generated/image-cropper.jsx';
export * from './generated/input.jsx';
export * from './generated/listbox.jsx';
export * from './generated/marquee.jsx';
export * from './generated/menu.jsx';
export * from './generated/menubar.jsx';
export * from './generated/meter.jsx';
export * from './generated/navigation-menu.jsx';
export * from './generated/number-input.jsx';
export * from './generated/pagination.jsx';
export * from './generated/password-input.jsx';
export * from './generated/pin-input.jsx';
export * from './generated/popover.jsx';
export * from './generated/progress.jsx';
export * from './generated/qr-code.jsx';
export * from './generated/radio-group.jsx';
export * from './generated/rating-group.jsx';
export * from './generated/scroll-area.jsx';
export * from './generated/segment-group.jsx';
export * from './generated/select.jsx';
export * from './generated/separator.jsx';
export * from './generated/signature-pad.jsx';
export * from './generated/slider.jsx';
export * from './generated/splitter.jsx';
export * from './generated/steps.jsx';
export * from './generated/switch.jsx';
export * from './generated/tabs.jsx';
export * from './generated/tags-input.jsx';
export * from './generated/timer.jsx';
export * from './generated/toast.jsx';
export * from './generated/toggle.jsx';
export * from './generated/toggle-group.jsx';
export * from './generated/toolbar.jsx';
export * from './generated/tooltip.jsx';
export * from './generated/tour.jsx';
export * from './generated/tree-view.jsx';
export * from './generated/badge.jsx';
export * from './generated/breadcrumb.jsx';
export * from './generated/card.jsx';
export * from './generated/command.jsx';
export * from './generated/input-group.jsx';
export * from './generated/skeleton.jsx';
export * from './generated/table.jsx';
export * from './generated/textarea.jsx';
export * from './hooks/index.js';
export * from './props.js';
export * from './conformance/solid-conformance.js';
export type {
  SolidPrimitiveCompositionProps,
  SolidPrimitivePartProps,
  SolidPrimitiveRenderPayload,
  SolidPrimitiveRootProps,
} from './internal/compound.jsx';
