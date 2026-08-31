import { readable, type Readable } from "svelte/store";
import { createAdapterBridge, type AdapterSnapshot } from "@mdfn/adapter-kit";
import type { EditorController } from "@mdfn/core";

export function createMdfnStore(controller: EditorController): Readable<AdapterSnapshot> {
  const state = controller.getState();
  const initial = { state, version: state.version, markdown: state.markdown, dirty: state.dirty, canUndo: controller.canUndo(), canRedo: controller.canRedo() };
  return readable(initial, (set) => {
    const bridge = createAdapterBridge(controller);
    set(bridge.getSnapshot());
    const unsubscribe = bridge.subscribe(() => set(bridge.getSnapshot()));
    return () => { unsubscribe(); bridge.destroy(); };
  });
}
