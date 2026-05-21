---
title: Bring your own framework
description: Mount authfn anywhere that hands you a Request — including bare http.createServer, Deno.serve, and AWS Lambda.
---

# Bring your own framework

If your framework isn't in the bundled list, you can still mount authfn — the kernel needs only:

1. A way to receive a WHATWG `Request`.
2. A way to send a WHATWG `Response`.

That's it.

## Bare Node `http`

```ts
import { createServer } from 'node:http';
import { auth } from './auth.js';

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v) headers.set(k, v);
  }

  const body = req.method === 'GET' || req.method === 'HEAD'
    ? null
    : await new Promise<Buffer>((resolve) => {
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
      });

  const request = new Request(url, { method: req.method ?? 'GET', headers, body });
  const response = await auth.router.fetch(request);

  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  if (response.body) {
    const text = await response.text();
    res.end(text);
  } else {
    res.end();
  }
}).listen(3000);
```

## Deno

```ts
import { auth } from './auth.ts';

Deno.serve({ port: 3000 }, (request) => auth.router.fetch(request));
```

## AWS Lambda (function URLs)

```ts
import { auth } from './auth.js';

export const handler = async (event: any) => {
  const url = `https://${event.requestContext.domainName}${event.rawPath}${event.rawQueryString ? '?' + event.rawQueryString : ''}`;
  const headers = new Headers(event.headers);
  const body = event.body ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8') : null;
  const request = new Request(url, { method: event.requestContext.http.method, headers, body });
  const response = await auth.router.fetch(request);
  const buf = await response.arrayBuffer();
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: Buffer.from(buf).toString('base64'),
    isBase64Encoded: true,
  };
};
```

## Cloudflare Workers (no framework)

```ts
import { auth } from './auth.js';
export default { fetch(request) { return auth.router.fetch(stripAuthPrefix(request)); } };
```

## Pattern

Whatever your framework looks like, the integration always reduces to:

1. Build a `Request` from the framework's incoming representation.
2. Call `auth.router.fetch(request)`.
3. Translate the resulting `Response` to your framework's outgoing representation.

If you find yourself wishing for a bundled adapter for your framework, the [authoring guide](https://github.com/21nCo/super-functions/tree/dev/packages/http) is short — most adapters are < 100 lines.
