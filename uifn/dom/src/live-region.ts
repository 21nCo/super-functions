import { createUIFnError } from '@uifn/core/errors';
import type { UIFnDomScope } from './scope';

export type UIFnLivePoliteness = 'polite' | 'assertive';

export interface UIFnLiveAnnouncement {
  readonly id?: string;
  readonly message: string;
  readonly politeness?: UIFnLivePoliteness;
  readonly dedupeKey?: string;
  readonly clearAfterMs?: number;
}

export interface UIFnLiveRegion {
  announce(announcement: UIFnLiveAnnouncement): string;
  clear(id?: string): void;
  destroy(): void;
}

interface PendingAnnouncement {
  readonly id: string;
  readonly message: string;
  readonly politeness: UIFnLivePoliteness;
  readonly dedupeKey: string;
  cancelClear: () => void;
  stale: boolean;
}

function visuallyHide(element: HTMLElement): void {
  Object.assign(element.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: '0',
  });
}

export function createUIFnLiveRegion(scope: UIFnDomScope): UIFnLiveRegion {
  scope.assertAlive('create live region');
  const container = scope.document.createElement('div');
  container.setAttribute('data-uifn-live-region', scope.environment.scopeId);
  visuallyHide(container);
  const regions = new Map<UIFnLivePoliteness, HTMLElement>();
  for (const politeness of ['polite', 'assertive'] as const) {
    const region = scope.document.createElement('div');
    region.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
    region.setAttribute('aria-live', politeness);
    region.setAttribute('aria-atomic', 'true');
    container.appendChild(region);
    regions.set(politeness, region);
  }
  const target = scope.root.nodeType === 9
    ? scope.document.body ?? scope.document.documentElement
    : scope.root;
  target.appendChild(container);
  const pending = new Map<string, PendingAnnouncement>();
  const byDedupeKey = new Map<string, string>();
  let sequence = 0;
  let destroyed = false;
  let releasePublish: () => void = () => undefined;
  let releaseFrame: () => void = () => undefined;
  const queue: PendingAnnouncement[] = [];
  const releaseResource = scope.track('liveRegion');

  const clear = (id?: string) => {
    const entries = id ? [pending.get(id)].filter(Boolean) as PendingAnnouncement[] : [...pending.values()];
    for (const entry of entries) {
      entry.stale = true;
      entry.cancelClear();
      pending.delete(entry.id);
      if (byDedupeKey.get(entry.dedupeKey) === entry.id) byDedupeKey.delete(entry.dedupeKey);
    }
    if (!id) for (const region of regions.values()) region.textContent = '';
  };

  const publishQueue = () => {
    releasePublish = () => undefined;
    const entry = queue.shift();
    if (!entry || entry.stale || destroyed) return;
    const region = regions.get(entry.politeness)!;
    region.textContent = '';
    releaseFrame = scope.requestAnimationFrame(() => {
      releaseFrame = () => undefined;
      if (entry.stale || destroyed) return;
      region.textContent = entry.message;
      scope.environment.trace({
        kind: 'dom-live-region',
        operation: 'announce',
        timestamp: scope.environment.now(),
        details: { announcementId: entry.id, politeness: entry.politeness },
      });
      if (queue.length > 0) releasePublish = scope.setTimeout(publishQueue, 50);
    });
  };

  return {
    announce(announcement) {
      scope.assertAlive('announce live message');
      if (destroyed) throw createUIFnError({
        code: 'UIFN_DOM_SERVICE_DESTROYED',
        package: '@uifn/dom',
        component: 'LiveRegion',
        message: 'Cannot announce through a destroyed live region.',
      });
      sequence += 1;
      const id = announcement.id ?? `announcement-${sequence}`;
      if (pending.has(id)) {
        throw createUIFnError({
          code: 'UIFN_LIVE_REGION_STALE_MESSAGE',
          package: '@uifn/dom',
          component: 'LiveRegion',
          message: `Announcement ${id} is already pending.`,
          details: { announcementId: id },
        });
      }
      const dedupeKey = announcement.dedupeKey ?? `${announcement.politeness ?? 'polite'}:${announcement.message}`;
      const duplicateId = byDedupeKey.get(dedupeKey);
      if (duplicateId) return duplicateId;
      const entry: PendingAnnouncement = {
        id,
        message: announcement.message,
        politeness: announcement.politeness ?? 'polite',
        dedupeKey,
        cancelClear: () => undefined,
        stale: false,
      };
      if ((announcement.clearAfterMs ?? 0) > 0) {
        entry.cancelClear = scope.setTimeout(() => clear(id), announcement.clearAfterMs!);
      }
      pending.set(id, entry);
      byDedupeKey.set(dedupeKey, id);
      queue.push(entry);
      if (queue.length === 1) releasePublish = scope.setTimeout(publishQueue, 0);
      return id;
    },
    clear,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      releasePublish();
      releaseFrame();
      clear();
      queue.splice(0);
      container.remove();
      releaseResource();
    },
  };
}
