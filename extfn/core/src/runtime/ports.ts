import { createExtfnError } from '../errors.js';
import { assertPayloadWithinLimit } from './capabilities.js';
import {
  createPortCloseEnvelope,
  createPortEnvelope,
  type PortCloseReason,
  type RuntimePortCloseEnvelope,
  type RuntimePortEnvelope,
} from './envelope.js';
import { createHandlerNotFoundError } from './errors.js';
import type {
  BackgroundPortHandlerDefinition,
  RuntimeAddress,
} from '../types.js';

export interface RuntimePort<Inbound = unknown, Outbound = Inbound> {
  id: string;
  channel: string;
  state: 'opening' | 'open' | 'reconnecting' | 'closed';
  send(payload: Outbound): Promise<void>;
  onMessage(
    handler: (payload: Inbound, envelope: RuntimePortEnvelope) => void | Promise<void>
  ): () => void;
  onClose(
    handler: (envelope: RuntimePortCloseEnvelope) => void | Promise<void>
  ): () => void;
  close(): Promise<void>;
}

export interface PortClient {
  open<Inbound = unknown, Outbound = Inbound>(
    channel: string,
    target?: Partial<RuntimeAddress>,
    options?: {
      reconnect?: 'never' | 'background-resume';
      timeoutMs?: number;
    }
  ): Promise<RuntimePort<Inbound, Outbound>>;
}

export interface CreatePortBrokerOptions {
  address: RuntimeAddress;
  handlers?: readonly BackgroundPortHandlerDefinition[];
  runtimeProvider?: () => unknown;
  onStateChange?: (portId: string, state: RuntimePort['state']) => void;
}

export function createPortBroker(options: CreatePortBrokerOptions): {
  client: PortClient;
  suspendBackground(): Promise<void>;
  resumeBackground(): Promise<void>;
} {
  const handlerMap = new Map<string, BackgroundPortHandlerDefinition>();
  const sessions = new Map<string, PortSession>();

  for (const handler of options.handlers ?? []) {
    if (
      typeof handler.channel !== 'string' ||
      handler.channel.trim() === ''
    ) {
      throw createExtfnError(
        'E_CONFIG_INVALID',
        'Invalid background port handler registration.'
      );
    }

    if (handlerMap.has(handler.channel)) {
      throw createExtfnError(
        'E_MANIFEST_COLLISION',
        `Duplicate background port channel: ${handler.channel}`
      );
    }

    handlerMap.set(handler.channel, handler);
  }

  return {
    client: {
      async open<Inbound = unknown, Outbound = Inbound>(
        channel: string,
        _target?: Partial<RuntimeAddress>,
        portOptions?: {
          reconnect?: 'never' | 'background-resume';
          timeoutMs?: number;
        }
      ): Promise<RuntimePort<Inbound, Outbound>> {
        const handler = handlerMap.get(channel);
        if (!handler) {
          throw createHandlerNotFoundError(channel, 'port');
        }

        const session = createPortSession({
          channel,
          source: options.address,
          handler,
          runtimeProvider: options.runtimeProvider,
          reconnect: portOptions?.reconnect ?? 'never',
          timeoutMs: portOptions?.timeoutMs ?? 30000,
          onStateChange: options.onStateChange,
        });

        sessions.set(session.id, session);
        session.clientPort.onClose(() => {
          sessions.delete(session.id);
        });
        await session.connect();
        return session.clientPort as RuntimePort<Inbound, Outbound>;
      },
    },
    async suspendBackground() {
      await Promise.all(
        [...sessions.values()].map((session) => session.suspend())
      );
    },
    async resumeBackground() {
      await Promise.all(
        [...sessions.values()].map((session) => session.resume())
      );
    },
  };
}

interface PortSession {
  id: string;
  clientPort: RuntimePort;
  connect(): Promise<void>;
  suspend(): Promise<void>;
  resume(): Promise<void>;
}

function createPortSession(options: {
  channel: string;
  source: RuntimeAddress;
  handler: BackgroundPortHandlerDefinition;
  runtimeProvider?: () => unknown;
  reconnect: 'never' | 'background-resume';
  timeoutMs: number;
  onStateChange?: (portId: string, state: RuntimePort['state']) => void;
}): PortSession {
  const id = `port_${Math.random().toString(36).slice(2, 10)}`;
  const inboundListeners = new Set<
    (payload: unknown, envelope: RuntimePortEnvelope) => void | Promise<void>
  >();
  const serverListeners = new Set<
    (payload: unknown, envelope: RuntimePortEnvelope) => void | Promise<void>
  >();
  const clientCloseListeners = new Set<
    (envelope: RuntimePortCloseEnvelope) => void | Promise<void>
  >();
  const serverCloseListeners = new Set<
    (envelope: RuntimePortCloseEnvelope) => void | Promise<void>
  >();
  let state: RuntimePort['state'] = 'opening';
  let inboundSeq = 0;
  let outboundSeq = 0;
  let reconnectTimer: NodeJS.Timeout | undefined;

  const setState = (nextState: RuntimePort['state']) => {
    state = nextState;
    options.onStateChange?.(id, nextState);
  };

  const serverPort: RuntimePort = {
    id,
    channel: options.channel,
    get state() {
      return state;
    },
    async send(payload: unknown) {
      assertPayloadWithinLimit(payload);
      outboundSeq += 1;
      const envelope = createPortEnvelope({
        portId: id,
        channel: options.channel,
        seq: outboundSeq,
        source: options.source,
        payload,
      });
      for (const listener of inboundListeners) {
        await listener(payload, envelope);
      }
    },
    onMessage(handler) {
      serverListeners.add(handler);
      return () => serverListeners.delete(handler);
    },
    onClose(handler) {
      serverCloseListeners.add(handler);
      return () => serverCloseListeners.delete(handler);
    },
    close: async () => {
      await emitClose('target-closed');
    },
  };

  const clientPort: RuntimePort = {
    id,
    channel: options.channel,
    get state() {
      return state;
    },
    async send(payload: unknown) {
      assertPayloadWithinLimit(payload);
      if (state !== 'open') {
        throw createExtfnError(
          'E_CONTEXT_UNAVAILABLE',
          `Port is not open: ${options.channel}`
        );
      }

      inboundSeq += 1;
      const envelope = createPortEnvelope({
        portId: id,
        channel: options.channel,
        seq: inboundSeq,
        source: options.source,
        payload,
      });

      if (typeof options.handler.onMessage === 'function') {
        await options.handler.onMessage(
          options.runtimeProvider?.(),
          payload,
          envelope,
          serverPort
        );
      }

      for (const listener of serverListeners) {
        await listener(payload, envelope);
      }
    },
    onMessage(handler) {
      inboundListeners.add(handler);
      return () => inboundListeners.delete(handler);
    },
    onClose(handler) {
      clientCloseListeners.add(handler);
      return () => clientCloseListeners.delete(handler);
    },
    close: async () => {
      await emitClose('client-closed');
    },
  };

  async function emitClose(reason: PortCloseReason): Promise<void> {
    if (state === 'closed') {
      return;
    }

    clearReconnectTimer();
    setState('closed');
    const envelope = createPortCloseEnvelope({
      portId: id,
      channel: options.channel,
      source: options.source,
      reason,
    });
    for (const listener of clientCloseListeners) {
      await listener(envelope);
    }
    for (const listener of serverCloseListeners) {
      await listener(envelope);
    }
    if (typeof options.handler.onDisconnect === 'function') {
      await options.handler.onDisconnect(
        options.runtimeProvider?.(),
        envelope,
        serverPort
      );
    }
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  }

  return {
    id,
    clientPort,
    async connect() {
      setState('open');
      if (typeof options.handler.onConnect === 'function') {
        await options.handler.onConnect(
          options.runtimeProvider?.(),
          serverPort,
          options.source
        );
      }
    },
    async suspend() {
      if (state !== 'open') {
        return;
      }

      if (options.reconnect === 'background-resume') {
        // The server context is being discarded. Its listeners must not survive
        // into the replacement context registered by the next onConnect call.
        serverListeners.clear();
        serverCloseListeners.clear();
        setState('reconnecting');
        clearReconnectTimer();
        reconnectTimer = setTimeout(() => {
          void emitClose('context-unavailable');
        }, options.timeoutMs);
        return;
      }

      await emitClose('background-restarted');
    },
    async resume() {
      if (state !== 'reconnecting') {
        return;
      }

      clearReconnectTimer();
      setState('open');
      if (typeof options.handler.onConnect === 'function') {
        await options.handler.onConnect(
          options.runtimeProvider?.(),
          serverPort,
          options.source
        );
      }
    },
  };
}
