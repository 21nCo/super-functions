import {
  createAdminCapabilityAdapter,
  defineAdminCapability
} from '@superfunctions/admin';

export const cliFnAdminCapability = defineAdminCapability({
  schemaVersion: '1.0',
  id: 'clifn',
  displayName: 'CliFn',
  version: '0.1.0',
  description: 'CliFn administration availability for Super Console installations.',
  category: 'developer-tools',
  availability: 'unavailable',
  unavailableReason:
    'CliFn currently provides process-local CLI configuration, credentials, diagnostics, and command execution utilities, but no server-side operator service with a durable authorization boundary. Exposing those utilities would create an unsafe remote shell or local-secret surface.',
  scopeLevels: ['installation'],
  operations: []
});

export const cliFnAdminAdapter = createAdminCapabilityAdapter(
  cliFnAdminCapability,
  {}
);

export const adminCapability = cliFnAdminCapability;
export const adminAdapter = cliFnAdminAdapter;
