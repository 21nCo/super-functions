import { handleConfiguredSuperConsole } from '$lib/server/transport';
import type { RequestHandler } from './$types';

const handle: RequestHandler = ({ request }) => handleConfiguredSuperConsole(request);

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
