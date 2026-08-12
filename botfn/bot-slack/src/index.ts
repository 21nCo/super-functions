import { Hono } from 'hono';
import { verifySlackRequest } from '@botfn/slack-core';

type Bindings = {
  SLACK_SIGNING_SECRET: string;
  SLACK_BOT_TOKEN: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.post('/slack/events', async (c) => {
  const signatureValid = await verifySlackRequest(
    c.req.raw,
    c.env.SLACK_SIGNING_SECRET
  );

  if (!signatureValid) {
    return c.text('Invalid signature', 401);
  }

  const body = await c.req.json();

  // URL verification challenge
  if (body.type === 'url_verification') {
    return c.text(body.challenge);
  }

  if (body.event) {
    console.log('Received event:', body.event.type);
    return c.text('OK');
  }

  return c.text('OK');
});

export default app;
