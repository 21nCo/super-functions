import { applySelectedResources } from '../shared/selected-resources.js';
import document from '../google/discovery/sheets.js';
import { googleDiscoveryProvider, type Discovery } from '../google/discovery-provider.js';
export const googleSheetsProvider = googleDiscoveryProvider('google-sheets', document as Discovery,
{
  "spreadsheets.get": "spreadsheets.get",
  "spreadsheets.create": "spreadsheets.create",
  "values.get": "spreadsheets.values.get",
  "values.batchGet": "spreadsheets.values.batchGet",
  "values.update": "spreadsheets.values.update",
  "values.append": "spreadsheets.values.append",
  "spreadsheets.batchUpdate": "spreadsheets.batchUpdate"
}, ['https://www.googleapis.com/auth/spreadsheets']);

applySelectedResources(googleSheetsProvider);
