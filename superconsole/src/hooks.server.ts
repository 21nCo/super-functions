import { env } from '$env/dynamic/private';
import { bootConfiguredSuperConsole } from '$lib/server/transport';
import type { Handle } from '@sveltejs/kit';

/**
 * Self-host entry seam. Set SUPERCONSOLE_INSTALLATION to an absolute file URL
 * for a module exporting a fully composed `SuperConsole`. Startup validates
 * explicit modules and required audit/idempotency/confirmation infrastructure.
 */
await bootConfiguredSuperConsole(env.SUPERCONSOLE_INSTALLATION);

export const handle: Handle = ({ event, resolve }) => resolve(event);
