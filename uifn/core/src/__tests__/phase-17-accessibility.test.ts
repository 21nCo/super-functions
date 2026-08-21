import { describe, expect, it } from 'vitest';
import {
  createAngleSliderController,
  createAutocompleteController,
  createCheckboxGroupController,
  createContextMenuController,
  createEditableController,
  createFileUploadController,
  createFloatingPanelController,
  createHoverCardController,
  createImageCropperController,
  createNumberInputController,
  createPaginationController,
  createPasswordInputController,
  createRadioGroupController,
  createSignaturePadController,
  createSliderController,
  createSelectController,
  createSplitterController,
} from '../primitives';

const env = (name: string) => ({
  mode: 'test' as const,
  scopeId: `phase17-${name}`,
  hydrationSeed: `phase17-${name}`,
  generateId: (scope: string) => `${name}-${scope}`,
});

describe('PHASE_17 browser-discovered accessibility regressions', () => {
  it('keeps neutral wrappers free of role-specific ARIA and avoids nested group controls', () => {
    const checkbox = createCheckboxGroupController({
      items: ['item-1'],
      defaultValue: ['item-1'],
      readOnly: true,
      required: true,
    }, env('checkbox-group'));
    const radio = createRadioGroupController({
      items: ['item-1'],
      defaultValue: 'item-1',
      readOnly: true,
      required: true,
    }, env('radio-group'));

    expect(checkbox.parts.root.getProps().aria?.readonly).toBeUndefined();
    expect(checkbox.parts.item.getProps('item-1').role).toBeUndefined();
    expect(checkbox.parts.item.getProps('item-1').tabIndex).toBeUndefined();
    expect(checkbox.parts.itemControl.getProps('item-1')).toMatchObject({
      role: 'checkbox',
      aria: { checked: true },
    });
    expect(radio.parts.root.getProps().aria?.readonly).toBeUndefined();
    expect(radio.parts.item.getProps('item-1').role).toBeUndefined();
    expect(radio.parts.itemControl.getProps('item-1')).toMatchObject({
      role: 'radio',
      aria: { checked: true },
    });

    checkbox.destroy();
    radio.destroy();
  });

  it('names range and meter controls and supplies their required finite values', () => {
    const angle = createAngleSliderController({}, env('angle'));
    const number = createNumberInputController({ defaultValue: '' }, env('number'));
    const password = createPasswordInputController({ defaultValue: '' }, env('password'));
    const floating = createFloatingPanelController({ defaultOpen: true }, env('floating'));
    const cropper = createImageCropperController({
      src: 'data:image/gif;base64,R0lGODlhAQABAAD/ACw=',
    }, env('cropper'));

    expect(angle.parts.thumb.getProps().aria).toMatchObject({
      label: 'Angle',
      valuemin: 0,
      valuemax: 360,
      valuenow: 0,
    });
    expect(number.parts.scrubber.getProps().aria).toMatchObject({
      label: 'Adjust value',
      valuenow: 0,
    });
    expect(password.parts.strength.getProps().aria).toMatchObject({
      label: 'Password strength',
      valuemin: 0,
      valuemax: 4,
      valuenow: 0,
    });
    expect(floating.parts.resizeHandle.getProps('south-east').aria).toMatchObject({
      valuemin: 160,
      valuenow: 320,
      valuetext: '320 by 240 pixels',
    });
    expect(cropper.parts.handle.getProps('se').aria).toMatchObject({
      valuemin: 1,
      valuenow: 100,
      valuetext: '100 by 100 pixels',
    });

    angle.destroy();
    number.destroy();
    password.destroy();
    floating.destroy();
    cropper.destroy();
  });

  it('does not emit unsupported orientation, readonly, or expanded attributes', () => {
    const slider = createSliderController({}, env('slider'));
    const splitter = createSplitterController({}, env('splitter'));
    const signature = createSignaturePadController({ readOnly: true }, env('signature'));
    const contextMenu = createContextMenuController({}, env('context-menu'));
    const hoverCard = createHoverCardController({ defaultOpen: true }, env('hover-card'));

    expect(slider.parts.root.getProps().aria?.orientation).toBeUndefined();
    expect(splitter.parts.root.getProps().aria?.orientation).toBeUndefined();
    expect(signature.parts.canvas.getProps().aria?.readonly).toBeUndefined();
    expect(signature.parts.canvas.getProps().data?.readonly).toBe(true);
    expect(contextMenu.parts.trigger.getProps().aria?.expanded).toBeUndefined();
    expect(hoverCard.parts.trigger.getProps().aria?.expanded).toBeUndefined();
    expect(hoverCard.parts.trigger.getProps().aria?.describedby).toBeTruthy();

    slider.destroy();
    splitter.destroy();
    signature.destroy();
    contextMenu.destroy();
    hoverCard.destroy();
  });

  it('gives the Select combobox trigger a stable accessible name reference', () => {
    const select = createSelectController({
      items: [{ id: 'item-1', textValue: 'Item 1' }],
      defaultValue: 'item-1',
    }, env('select'));

    expect(select.parts.trigger.getProps().aria?.labelledby)
      .toBe(select.parts.label.getProps().id);

    select.destroy();
  });

  it('keeps naming and validation ARIA off structural form and collection roots', () => {
    const autocomplete = createAutocompleteController({ items: [{ id: 'item-1', textValue: 'Item 1' }] }, env('autocomplete-root'));
    const editable = createEditableController({}, env('editable-root'));
    const fileUpload = createFileUploadController({}, env('file-upload-root'));
    const select = createSelectController({ items: [{ id: 'item-1', textValue: 'Item 1' }] }, env('select-root'));

    expect(autocomplete.parts.root.getProps().aria).toEqual({});
    expect(editable.parts.root.getProps().aria).toEqual({});
    expect(fileUpload.parts.root.getProps().aria).toEqual({});
    expect(select.parts.root.getProps().aria).toEqual({});

    autocomplete.destroy();
    editable.destroy();
    fileUpload.destroy();
    select.destroy();
  });

  it('rejects non-finite pagination values before they can enter a runtime snapshot', () => {
    expect(() => createPaginationController({ count: 1, page: Number.NaN }, env('pagination-nan')))
      .toThrowError(expect.objectContaining({
        code: 'UIFN_ERR_INVALID_VALUE',
        details: { page: 'NaN' },
      }));
    const pagination = createPaginationController({ count: 10 }, env('pagination-action'));
    expect(() => pagination.actions.focusPage(Number.POSITIVE_INFINITY))
      .toThrowError(expect.objectContaining({
        code: 'UIFN_ERR_INVALID_VALUE',
        details: { page: 'Infinity' },
      }));
    pagination.destroy();
  });
});
