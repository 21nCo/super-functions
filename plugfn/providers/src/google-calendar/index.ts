import { applySelectedResources } from '../shared/selected-resources.js';
import document from '../google/discovery/calendar.json' with { type: 'json' };
import { googleDiscoveryProvider, type Discovery } from '../google/discovery-provider.js';
export const googleCalendarProvider = googleDiscoveryProvider('google-calendar', document as Discovery,
{
  "calendars.list": "calendarList.list",
  "events.list": "events.list",
  "events.get": "events.get",
  "events.create": "events.insert",
  "events.update": "events.update",
  "events.delete": "events.delete",
  "freebusy.query": "freebusy.query"
}, ['https://www.googleapis.com/auth/calendar']);

applySelectedResources(googleCalendarProvider);
