import { createExtfnError } from '../errors.js';

export interface MountedContentRoot {
  moduleId: string;
  anchorKey: string;
  anchor: Element;
  root: HTMLElement;
  shadowRoot?: ShadowRoot;
  styleTarget: HTMLElement | ShadowRoot;
  cleanup?: () => void;
}

export class MountRegistry {
  private readonly mounts = new Map<string, MountedContentRoot>();

  get(moduleId: string, anchorKey: string): MountedContentRoot | undefined {
    return this.mounts.get(createRegistryKey(moduleId, anchorKey));
  }

  register(mount: MountedContentRoot): MountedContentRoot {
    const key = createRegistryKey(mount.moduleId, mount.anchorKey);
    const existing = this.mounts.get(key);

    if (
      existing &&
      existing.root !== mount.root &&
      existing.root.isConnected
    ) {
      throw createExtfnError(
        'E_RUNTIME_PROTOCOL',
        `Duplicate content mount detected for ${mount.moduleId}/${mount.anchorKey}`
      );
    }

    this.mounts.set(key, mount);
    return mount;
  }

  remove(moduleId: string, anchorKey: string): void {
    const key = createRegistryKey(moduleId, anchorKey);
    const mount = this.mounts.get(key);
    if (!mount) {
      return;
    }

    mount.cleanup?.();
    mount.root.remove();
    this.mounts.delete(key);
  }

  entriesForModule(moduleId: string): MountedContentRoot[] {
    return [...this.mounts.values()].filter((mount) => mount.moduleId === moduleId);
  }
}

function createRegistryKey(moduleId: string, anchorKey: string): string {
  return `${moduleId}:${anchorKey}`;
}
