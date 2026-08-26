import { mergeContext, type UifnStoryDecorator } from './types';

export interface SuperfunctionMockContext {
  credentials: {
    type: 'fake';
    tenant: 'tenant_demo';
  };
  clients: Record<string, string>;
  session: {
    authenticated: boolean;
    userId: 'user_demo';
  };
}

export function createSuperfunctionMockContext(): SuperfunctionMockContext {
  return {
    credentials: {
      type: 'fake',
      tenant: 'tenant_demo',
    },
    clients: {
      authfn: 'mock-authfn',
      plugfn: 'mock-plugfn',
      filefn: 'mock-filefn',
      billfn: 'mock-billfn',
    },
    session: {
      authenticated: true,
      userId: 'user_demo',
    },
  };
}

export function createSuperfunctionMockDecorator(): UifnStoryDecorator {
  return (story, context) => story(mergeContext(context, {
    globals: {
      authSession: createSuperfunctionMockContext().session,
      superfunctions: createSuperfunctionMockContext(),
    },
    parameters: {
      uifnSuperfunctionMocks: createSuperfunctionMockContext(),
    },
  }));
}
