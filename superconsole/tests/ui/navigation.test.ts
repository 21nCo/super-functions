import { describe, expect, it } from 'vitest';
import {
  enabledNavigationModules,
  consoleDestinationEnabled,
  formatValue,
  moduleById,
  registryHasModule,
  shellSurfaceEnabled,
  statusTone,
  type RegistryViewModel,
} from '../../src/lib/components/view-models';

const registry: RegistryViewModel = {
  modules: [
    { id: 'watchfn', name: 'WatchFn', description: 'Observe', href: '/modules/watchfn', group: 'Observe', enabled: true },
    { id: 'logfn', name: 'LogFn', description: 'Logs', href: '/modules/logfn', group: 'Observe', enabled: true, parentModuleId: 'watchfn' },
    { id: 'contentfn', name: 'ContentFn', description: 'Content', href: '/modules/contentfn', group: 'Content', enabled: true, parentModuleId: 'cmsfn' },
    { id: 'cifn', name: 'CiFn', description: 'CI', href: '/modules/cifn', group: 'Deliver', enabled: true },
    { id: 'mailfn', name: 'MailFn', description: 'Mail', href: '/modules/mailfn', group: 'Communicate', enabled: false },
  ],
};

describe('operator navigation', () => {
  it('shows only enabled, top-level modules and folds nested functions into owners', () => {
    expect(enabledNavigationModules(registry).map(({ id }) => id)).toEqual(['cifn', 'watchfn']);
  });

  it('never resolves a disabled module', () => {
    expect(moduleById(registry, 'mailfn')).toBeUndefined();
    expect(moduleById(registry, 'CIFN')?.name).toBe('CiFn');
  });

  it('keeps SearchFn-backed navigation hidden when SearchFn is not enabled', () => {
    expect(registryHasModule(registry, 'searchfn')).toBe(false);
    expect(registryHasModule({ modules: [
      { id: 'searchfn', name: 'SearchFn', description: 'Search', href: '/modules/searchfn', enabled: true },
    ] }, 'searchfn')).toBe(true);
  });

  it('honors the registry shell-surface authorization projection', () => {
    const scoped = { ...registry, surfaces: { overview: true, search: false, audit: true, settings: false, api: false, mcp: true } };
    expect(shellSurfaceEnabled(scoped, 'mcp')).toBe(true);
    expect(shellSurfaceEnabled(scoped, 'api')).toBe(false);
    expect(shellSurfaceEnabled(scoped, 'settings')).toBe(false);
    expect(consoleDestinationEnabled(scoped, '/audit')).toBe(true);
    expect(consoleDestinationEnabled(scoped, '/settings')).toBe(false);
    expect(consoleDestinationEnabled(scoped, '/modules/watchfn/alerts')).toBe(true);
    expect(consoleDestinationEnabled(scoped, '/modules/mailfn/messages')).toBe(false);
  });

  it('maps operational statuses to stable semantic tones', () => {
    expect(statusTone('success')).toBe('success');
    expect(statusTone('running')).toBe('warning');
    expect(statusTone('failure')).toBe('danger');
    expect(statusTone('something-new')).toBe('neutral');
  });

  it('formats absent and timestamp values without throwing', () => {
    expect(formatValue(undefined)).toBe('—');
    expect(formatValue('2026-08-13T00:00:00.000Z', 'datetime')).not.toBe('—');
  });
});
