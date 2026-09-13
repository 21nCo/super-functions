import { applySelectedResources } from '../shared/selected-resources.js';
import type { ActionContext } from 'plugfn';
import document from '../google/discovery/drive.json' with { type: 'json' };
import { googleDiscoveryProvider, type Discovery } from '../google/discovery-provider.js';
export const googleDriveProvider = googleDiscoveryProvider('google-drive', document as Discovery,
{
  "files.search": "files.list",
  "files.get": "files.get",
  "files.export": "files.export",
  "files.create": "files.create",
  "files.update": "files.update",
  "permissions.list": "permissions.list",
  "permissions.create": "permissions.create",
  "permissions.delete": "permissions.delete"
}, ['https://www.googleapis.com/auth/drive']);

const getFile = googleDriveProvider.actions['files.get'];
googleDriveProvider.actions['files.download'] = {
  ...getFile, name: 'files.download', displayName: 'Download file',
  execute: (params: Record<string, unknown>, context: ActionContext) => getFile.execute({ ...params, alt: 'media' }, context),
};

applySelectedResources(googleDriveProvider);
