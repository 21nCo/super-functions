import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileUploadDefinition } from '../lib/generated/file-upload/definition.js';
import { SveltePrimitiveBridge } from '../lib/internal/compound.js';

afterEach(() => document.body.replaceChildren());

async function flushDomOwnership(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

describe('FileUpload Svelte DOM ownership', () => {
  it('connects the public trigger to the registered native input', async () => {
    const root = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'file';
    const bridge = new SveltePrimitiveBridge(FileUploadDefinition, { multiple: true }, {});
    const unsubscribe = bridge.subscribe(() => undefined);
    document.body.append(root, input);
    bridge.registerElement('root', undefined, root);
    bridge.registerElement('input', undefined, input);
    await flushDomOwnership();
    const selected = new File(['selected'], 'selected.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { configurable: true, value: [selected] });
    input.dispatchEvent(new Event('change'));
    expect(bridge.getController()?.state.fileCount).toBe(1);
    const click = vi.spyOn(input, 'click');

    bridge.getPartProps('trigger', undefined, {}).on?.click?.({ type: 'click' });

    expect(bridge.getController()?.state.status).toBe('picking');
    expect(click).toHaveBeenCalledOnce();
    unsubscribe();
    bridge.destroy();
  });
});
