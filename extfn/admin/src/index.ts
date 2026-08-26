import {
  createAdminCapabilityAdapter,
  defineAdminCapability
} from '@superfunctions/admin';

export const extFnAdminCapability = defineAdminCapability({
  schemaVersion: '1.0',
  id: 'extfn',
  displayName: 'ExtFn',
  version: '0.1.0',
  description: 'ExtFn administration availability for Super Console installations.',
  category: 'developer-tools',
  availability: 'unavailable',
  unavailableReason:
    'ExtFn currently provides build-time browser-extension tooling and in-extension runtime APIs, but no server-side extension lifecycle or operator service. Exposing build, packaging, browser credentials, signing material, or publishing actions without that boundary would be unsafe.',
  scopeLevels: ['installation'],
  operations: []
});

export const extFnAdminAdapter = createAdminCapabilityAdapter(
  extFnAdminCapability,
  {}
);

export const adminCapability = extFnAdminCapability;
export const adminAdapter = extFnAdminAdapter;
