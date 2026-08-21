import {
  MemoryAdminAuditSink,
  MemoryAdminIdempotencyStore,
} from '../../../packages/admin/dist/index.js';
import {
  createSearchFnAdminAdapter,
  createSearchFnDomainAdminService,
} from '../../../searchfn/admin/dist/index.js';
import { MemoryAdapter } from '../../../searchfn/adapter-memory/dist/index.js';
import { createSuperConsole } from '../../dist/server/index.js';

const scope = {
  organizationId: 'probe-org',
  workspaceId: 'probe-workspace',
  projectId: 'probe-project',
  environmentId: 'probe-environment',
  namespace: 'probe-tenant',
  region: 'local',
};

const principal = {
  actor: { id: 'probe-operator', permissions: ['*'] },
  displayName: 'Probe Operator',
  email: 'probe@example.test',
  role: 'installation administrator',
  defaultScope: scope,
};

const searchAdapter = new MemoryAdapter();
await searchAdapter.index({
  resource: 'docs',
  documents: [{ id: 'sfns-2', fields: { title: 'Super Console dev smoke probe' } }],
});
const searchFn = createSearchFnAdminAdapter(createSearchFnDomainAdminService({
  adapter: async () => searchAdapter,
  resources: async () => ['docs'],
}));

const confirmation = {
  issue: async () => ({
    token: 'probe-bound-confirmation',
    expiresAt: '2026-08-13T10:00:00.000Z',
  }),
  verify: async ({ token }) => token === 'probe-bound-confirmation',
};

export const superConsole = createSuperConsole({
  adapters: [searchFn],
  enabledModules: ['searchfn'],
  auth: {
    authenticate: async () => principal,
    authorizeScope: async ({ requested }) => requested,
    authorizeMutation: async () => undefined,
  },
  shellPolicy: { authorize: () => true },
  openApiSecuritySchemes: {
    operatorSession: { type: 'apiKey', in: 'cookie', name: 'probe.session' },
    operatorApiKey: { type: 'http', scheme: 'bearer', bearerFormat: 'Operator API key' },
  },
  openApiCsrfHeader: { name: 'X-Probe-CSRF' },
  audit: new MemoryAdminAuditSink(),
  idempotency: new MemoryAdminIdempotencyStore(),
  confirmation,
  overview: {
    read: async () => ({
      metrics: [{ id: 'probe-documents', label: 'Probe documents', value: 1, detail: 'SearchFn memory-adapter-backed production smoke run' }],
      alerts: [],
      activity: [],
      health: [{ moduleId: 'searchfn', moduleName: 'SearchFn', status: 'healthy' }],
    }),
  },
});
