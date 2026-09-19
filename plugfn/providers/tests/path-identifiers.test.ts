import {expect,it,vi} from 'vitest';
import {outlookProvider} from '../src/outlook/index.js';
import {googleDriveProvider} from '../src/google-drive/index.js';
import {segment} from '../src/shared/rest-action.js';
it.each(['.','..'])('rejects dot identifier %s before provider dispatch', async id => {
  const http = {get:vi.fn(),post:vi.fn()};
  await expect(outlookProvider.actions['events.create'].execute({calendarId:id,event:{subject:'test',start:{dateTime:'2026-09-13T12:00:00',timeZone:'UTC'},end:{dateTime:'2026-09-13T13:00:00',timeZone:'UTC'}}},{http} as any)).rejects.toThrow();
  await expect(googleDriveProvider.actions['files.get'].execute({fileId:id},{http} as any)).rejects.toThrow();
  expect(http.get).not.toHaveBeenCalled();
  expect(http.post).not.toHaveBeenCalled();
});
it('preserves escaped identifiers in the normalized request URL', () => {
  const id = 'calendar/with?reserved#characters';
  const url = new Request(`https://graph.microsoft.com/v1.0/me/calendars/${segment(id)}/events`).url;
  expect(url).toBe('https://graph.microsoft.com/v1.0/me/calendars/calendar%2Fwith%3Freserved%23characters/events');
});
