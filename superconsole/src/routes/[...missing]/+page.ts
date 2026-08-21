import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ url }) => {
  error(404, { message: `No Super Console route exists at ${url.pathname}.`, code: 'CONSOLE_ROUTE_NOT_FOUND' });
};
