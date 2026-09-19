import { applySelectedResources } from '../shared/selected-resources.js';
import document from '../google/discovery/docs.js';
import { googleDiscoveryProvider, type Discovery } from '../google/discovery-provider.js';
export const googleDocsProvider = googleDiscoveryProvider('google-docs', document as Discovery,
{
  "documents.get": "documents.get",
  "documents.create": "documents.create",
  "documents.batchUpdate": "documents.batchUpdate"
}, ['https://www.googleapis.com/auth/documents']);

applySelectedResources(googleDocsProvider);
