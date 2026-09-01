import { MailFnClient } from '@mailfn/client';
import { runAction, type RunnerContext } from '@clifn/core';

export interface RunMailFnCliOptions {
  args?: string[];
  env?: Record<string, string | undefined>;
  stdout?: (value: string) => void;
  stderr?: (value: string) => void;
}

export async function runMailFnCli(options: RunMailFnCliOptions = {}): Promise<number> {
  const env = options.env ?? process.env;
  const args = options.args ?? process.argv.slice(2);
  const parsed = parse(args);
  return runAction(
    async (_options, context) => {
      if (parsed.command === 'help') {
        context.output.info(help());
        return { exitCode: 0 };
      }
      const baseUrl = text(parsed.flags.url) ?? env.MAILFN_URL;
      const token = text(parsed.flags.token) ?? env.MAILFN_TOKEN;
      if (!baseUrl || !token) throw new Error('MAILFN_URL and MAILFN_TOKEN (or --url and --token) are required');
      const client = new MailFnClient({ baseUrl, token });
      const data = await execute(client, parsed.command, parsed.positionals, parsed.flags);
      const safe = redactForCommand(parsed.command, data, {
        showContent: Boolean(parsed.flags.showContent),
        showSecrets: Boolean(parsed.flags.showSecrets),
      });
      if (parsed.flags.json) context.output.json(safe);
      else render(context, parsed.command, safe);
      return { exitCode: 0 };
    },
    {},
    {
      env: env as NodeJS.ProcessEnv,
      mode: parsed.flags.json ? 'json' : 'text',
      stdout: options.stdout,
      stderr: options.stderr,
      nonInteractive: true,
    },
  );
}

async function execute(
  client: MailFnClient,
  command: string,
  positionals: string[],
  flags: Record<string, string | boolean | undefined>,
): Promise<unknown> {
  switch (command) {
    case 'inbox:create':
      return client.createInbox({
        kind: flags.stable ? 'stable' : 'expiring',
        requestedLocalPart: text(flags.local),
        domain: text(flags.domain),
        displayName: text(flags.name),
        expirySeconds: number(flags.expires),
        idempotencyKey: text(flags.idempotencyKey),
      });
    case 'inbox:list': return client.listInboxes();
    case 'inbox:get': return client.getInbox(required(positionals[0], 'inbox id'));
    case 'inbox:delete': return client.deleteInbox(required(positionals[0], 'inbox id'));
    case 'message:list':
      return client.listMessages(required(positionals[0], 'inbox id'), {
        sender: text(flags.sender), subject: text(flags.subject), receivedAfter: text(flags.after),
        unreadOnly: Boolean(flags.unread), limit: number(flags.limit),
      });
    case 'message:read': return client.readMessage(required(positionals[0], 'inbox id'), required(positionals[1], 'message id'));
    case 'message:attachments': return client.listAttachments(required(positionals[0], 'inbox id'), required(positionals[1], 'message id'));
    case 'message:wait':
      return client.waitForMessages(required(positionals[0], 'inbox id'), {
        sender: text(flags.sender), senderDomain: text(flags.senderDomain), subject: text(flags.subject),
        after: text(flags.after), timeoutMs: number(flags.timeout), expectedCount: number(flags.count),
      });
    case 'message:extract':
      return client.extractVerification(
        required(positionals[0], 'inbox id'), required(positionals[1], 'message id'),
        flags.link ? 'verification_link' : 'otp',
      );
    case 'token:revoke':
      return client.revokeToken(required(positionals[0], 'inbox id'), required(positionals[1], 'token id'));
    case 'domain:create': return client.createDomain(required(positionals[0], 'domain'));
    case 'domain:verify': return client.verifyDomain(required(positionals[0], 'domain id'));
    case 'operations': return client.getOperationalSnapshot();
    default: throw new Error(help());
  }
}

function render(
  context: RunnerContext,
  command: string,
  safe: unknown,
): void {
  if (command === 'inbox:create') {
    context.output.success('Inbox created');
    context.output.info(JSON.stringify(safe, null, 2));
    return;
  }
  context.output.info(JSON.stringify(safe, null, 2));
}

function redactForCommand(
  command: string,
  value: unknown,
  options: { showContent: boolean; showSecrets: boolean },
): unknown {
  if (command === 'message:extract') return value;
  return redactSensitive(value, {
    hideMessageContent: command.startsWith('message:') && !options.showContent,
    hideSecrets: !options.showSecrets,
  });
}

function redactSensitive(
  value: unknown,
  options: { hideMessageContent: boolean; hideSecrets: boolean },
): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => redactSensitive(entry, options));
  const messageContent = /^(subject|headers|metadata|from|to|cc|bcc|replyTo|envelopeFrom|envelopeTo|textBody|htmlBody|rawObjectKey|authenticationResults|filename)$/i;
  const secret = /token|secret|verification|raw|ciphertext|password|authorization/i;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    (options.hideSecrets && secret.test(key)) || (options.hideMessageContent && messageContent.test(key))
      ? '[REDACTED]'
      : redactSensitive(entry, options),
  ]));
}

function parse(args: string[]): {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean | undefined>;
} {
  const [noun, verb, ...rest] = args;
  if (!noun || noun === '--help' || noun === 'help') return { command: 'help', positionals: [], flags: {} };
  const command = verb && !verb.startsWith('-') ? `${noun}:${verb}` : noun;
  const values = verb && !verb.startsWith('-') ? rest : [verb, ...rest].filter(Boolean) as string[];
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (!value.startsWith('--')) { positionals.push(value); continue; }
    const key = value.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const next = values[index + 1];
    if (next && !next.startsWith('--')) { flags[key] = next; index += 1; }
    else flags[key] = true;
  }
  return { command, positionals, flags };
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
function text(value: string | boolean | undefined): string | undefined { return typeof value === 'string' ? value : undefined; }
function number(value: string | boolean | undefined): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${value}`);
  return parsed;
}

function help(): string {
  return [
    'MailFn commands:',
    '  inbox create|list|get|delete',
    '  message list|read|attachments|wait|extract',
    '  token revoke',
    '  domain create|verify',
    '  operations',
    'Message content is redacted unless the command is explicitly extract or --show-content is supplied.',
    'Credentials and other secrets are redacted unless --show-secrets is supplied.',
  ].join('\n');
}
