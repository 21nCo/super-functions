import { describe, expect, it, vi } from 'vitest';
import {
  AvatarContract, ButtonContract, FieldContract, FieldsetContract, FormContract, InputContract,
  MarqueeContract, QRCodeContract, SeparatorContract,
  createAccordionController, createCollapsibleController, createImageCropperController,
  createScrollAreaController, createToolbarController,
} from '../index';

const staticContracts = [AvatarContract, ButtonContract, FieldContract, FieldsetContract, FormContract, InputContract, MarqueeContract, QRCodeContract, SeparatorContract] as const;

describe('PHASE_06 foundational primitive contracts', () => {
  it('keeps every static primitive free of controller/subscription/effect APIs', () => {
    for (const contract of staticContracts) {
      expect(contract.kind).toBe('typed-static-contract');
      expect('subscribe' in contract).toBe(false);
      expect('destroy' in contract).toBe(false);
      expect('actions' in contract).toBe(false);
      expect(contract.anatomy.length).toBeGreaterThan(0);
    }
  });

  it('preserves native button, input, fieldset, form, and separator semantics', () => {
    const button = ButtonContract.getParts({ loading: true, pressed: true }, { scopeId: 'native' }).root;
    expect(ButtonContract.anatomy[0]?.element).toBe('button');
    expect(button.role).toBeUndefined();
    expect(button.attributes?.type).toBe('button');
    expect(button.disabled).toBe(true);
    expect(button.aria).toMatchObject({ busy: true, pressed: true });

    const input = InputContract.getParts({ name: 'email', required: true, invalid: true }, { scopeId: 'native' }).root;
    expect(InputContract.anatomy[0]?.element).toBe('input');
    expect(input.attributes).toMatchObject({ type: 'text', name: 'email', required: true });
    expect(input.aria?.invalid).toBe(true);

    expect(FieldsetContract.anatomy[0]?.element).toBe('fieldset');
    expect(FormContract.anatomy[0]?.element).toBe('form');
    expect(SeparatorContract.getParts({ decorative: true }, { scopeId: 'native' }).root.role).toBe('presentation');
  });

  it('creates deterministic field relationships and SSR-stable static output', () => {
    const first = FieldContract.getParts({ required: true, invalid: true, name: 'email' }, { scopeId: 'account' });
    const second = FieldContract.getParts({ required: true, invalid: true, name: 'email' }, { scopeId: 'account' });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.label.attributes?.for).toBe(first.control.id);
    expect(String(first.control.aria?.describedby)).toContain(first.error.id as string);
    expect(first.error.role).toBe('alert');
  });

  it('defines motion reduction, avatar alt text, and QR accessible naming', () => {
    expect(MarqueeContract.getState({ reducedMotion: true, reducedMotionBehavior: 'stop' }).status).toBe('paused');
    expect(AvatarContract.getParts({ alt: 'Profile image' }, { scopeId: 'a' }).image.attributes?.alt).toBe('Profile image');
    const qrInputs = { value: 'https://21n.org', label: 'Open 21n' } as const;
    const qrState = QRCodeContract.getState(qrInputs);
    const qrImage = QRCodeContract.getParts(qrInputs, { scopeId: 'qr' }).image;
    expect(qrImage.aria?.label).toBe('Open 21n');
    expect(qrState.moduleCount).toBeGreaterThanOrEqual(21);
    expect(qrState.path.length).toBeGreaterThan(100);
    expect(qrState.viewBox).toBe(`0 0 ${qrState.moduleCount + 8} ${qrState.moduleCount + 8}`);
    expect(qrImage.data?.moduleCount).toBe(qrState.moduleCount);

    let invalidQRCodeError: unknown;
    try {
      QRCodeContract.getState({ value: '', label: '' });
    } catch (error) {
      invalidQRCodeError = error;
    }
    expect(invalidQRCodeError).toMatchObject({
      code: 'UIFN_ERR_INVALID_VALUE',
      component: 'QRCode',
    });
  });

  it('implements accordion disclosure semantics and mutation-safe focus', () => {
    const controller = createAccordionController({ items: ['one', 'two', 'three'], defaultValue: 'one' }, { generateId: () => 'ssr-a' });
    const trigger = controller.parts.trigger.getProps('one');
    expect(trigger.attributes?.type).toBe('button');
    expect(trigger.aria).toMatchObject({ expanded: true });
    expect(controller.parts.header.getProps('one').aria?.level).toBe(2);
    controller.actions.unregisterItem('one');
    expect(controller.state.focusedItem).toBe('two');
    controller.destroy();
  });

  it('uses native activation for Collapsible rather than synthetic key activation', () => {
    const controller = createCollapsibleController({}, { generateId: () => 'ssr-c' });
    const trigger = controller.parts.trigger.getProps();
    expect(trigger.attributes?.type).toBe('button');
    expect(trigger.on?.keydown).toBeUndefined();
    trigger.on?.click?.({ type: 'click' });
    expect(controller.state.open).toBe(true);
    controller.destroy();
  });

  it('supports image loading, bounded drag/resize, zoom, disabled state, and SSR parts', () => {
    const onCropChange = vi.fn();
    const controller = createImageCropperController({ src: '/photo.jpg', minSize: 20, maxSize: 300, onCropChange }, { generateId: () => 'crop-ssr' });
    const imageProps = controller.parts.image.getProps();
    expect(typeof imageProps.ref).toBe('function');
    if (typeof imageProps.ref === 'function') {
      imageProps.ref({ complete: true, naturalWidth: 200, naturalHeight: 150 });
    }
    controller.actions.startDrag({ x: 0, y: 0 });
    controller.actions.move({ x: 500, y: 500 });
    controller.actions.endInteraction();
    expect(controller.state.status).toBe('ready');
    expect(controller.state.crop.x + controller.state.crop.width).toBeLessThanOrEqual(200);
    expect(controller.state.crop.y + controller.state.crop.height).toBeLessThanOrEqual(150);
    expect(controller.parts.cropArea.getProps().style).toMatchObject({
      left: expect.stringContaining('%'),
      top: expect.stringContaining('%'),
      width: expect.stringContaining('%'),
      height: expect.stringContaining('%'),
    });
    expect(onCropChange).toHaveBeenCalled();
    expect(controller.parts.zoomControl.getProps().attributes?.type).toBe('range');
    expect(controller.parts.handle.getProps('se').aria?.label).toContain('se');
    controller.parts.image.getProps().on?.error?.({ type: 'error' });
    expect(controller.state.status).toBe('error');
    controller.destroy();
  });

  it('synchronizes ScrollArea scrollbar value semantics and keyboard scrolling', () => {
    const controller = createScrollAreaController({ orientation: 'vertical' }, { generateId: () => 'scroll-ssr' });
    controller.actions.setViewportMetrics({ scrollHeight: 1_000, clientHeight: 100, scrollWidth: 100, clientWidth: 100 });
    controller.parts.scrollbar.getProps('vertical').on?.keydown?.({ type: 'keydown', key: 'End' });
    expect(controller.state.viewport.scrollTop).toBe(900);
    const scrollbar = controller.parts.scrollbar.getProps('vertical');
    expect(scrollbar.aria).toMatchObject({ valuemin: 0, valuemax: 100, valuenow: 100 });
    expect(controller.parts.scrollbar.getProps('horizontal').hidden).toBe(true);
    controller.destroy();
  });

  it('implements labeled, RTL, disabled-aware toolbar roving focus through public parts', () => {
    const controller = createToolbarController({ dir: 'rtl', items: [{ id: 'a' }, { id: 'b', disabled: true }, { id: 'c' }], ariaLabel: 'Editor' }, { generateId: () => 'toolbar-ssr' });
    expect(controller.parts.root.getProps().aria).toMatchObject({ label: 'Editor' });
    controller.parts.button.getProps('a').on?.keydown?.({ type: 'keydown', key: 'ArrowRight' });
    expect(controller.state.focusedItem).toBe('c');
    controller.actions.setItems([{ id: 'c' }, { id: 'a' }]);
    expect(controller.state.focusedItem).toBe('c');
    controller.destroy();
  });
});
