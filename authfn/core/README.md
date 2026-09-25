# authfn

`authfn` is the session and identity kernel for the Superfunctions ecosystem. It composes declared plugins, manages browser sessions, generates schema/OpenAPI output, and provides `@superfunctions/auth` provider integration without bundling every auth method into the root package.

## Install

```bash
npm install authfn
```

Install only the plugin packages you use (`@authfn/password`, `@authfn/email-otp`, `@authfn/social-oauth`, `@authfn/api-keys`, `@authfn/two-factor`, `@authfn/multi-region`, `@authfn/native-handoff`) plus `@authfn/client` for browsers.

## Two-stage API

Declare a side-effect-free app, then inject runtime dependencies:

```ts
import { memoryAdapter } from '@superfunctions/db/testing';
import { authFnPlugins, authfn } from 'authfn';
import { authFnPasswordPlugin } from '@authfn/password';
import { authFnEmailOtpPlugin } from '@authfn/email-otp';

const authApp = authfn({
  namespace: 'authfn',
  plugins: authFnPlugins(
    authFnPasswordPlugin(),
    authFnEmailOtpPlugin()
  )
});

const auth = authApp.createServer({
  database: memoryAdapter({ debug: false }),
  pluginRuntime: {
    emailOtp: {
      delivery: {
        async send(input) {
          return { sent: true, metadata: { channel: input.channel } };
        }
      }
    }
  }
});
```

Mount `auth.router` with a `@superfunctions/http-*` adapter and use `auth.provider` anywhere an `@superfunctions/auth` provider is expected. `authApp.getSchema()` works without creating a server.

Full reference: [authfn docs → SDKs → authfn](https://authfn.superfunctions.dev/docs/sdk/core).
