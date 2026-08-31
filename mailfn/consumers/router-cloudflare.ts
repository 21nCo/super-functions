import {
  createMailFnCloudflareHandlers,
  type MailFnCloudflareEnv,
} from '@mailfn/cloudflare';

export interface RouterMailEnv extends MailFnCloudflareEnv {
  ROUTER_MAIL_FROM: string;
}

export function createRouterMailWorker() {
  const handlers = createMailFnCloudflareHandlers();
  return {
    fetch: (request: Request, env: RouterMailEnv) => handlers.fetch(request, env),
    email: handlers.email,
    queue: handlers.queue,
    scheduled: handlers.scheduled,
  };
}
