/**
 * WebSocket Handler for DataFn Sync
 *
 * Implements the server-side protocol for:
 * - Client registration (hello) with namespace tracking
 * - Cursor notifications (push -> broadcast) scoped to namespace or targeted principals
 *
 * SEC-001: Auth required via addClient authContext parameter
 * SEC-002: Namespace is server-derived, never client-supplied
 * SCA-005: Connection limits enforced at addClient time (close code 4503)
 * SCA-006: Namespace-scoped Map<namespace, Set<client>> for O(1) broadcast
 * REL-007: Native WS ping/pong heartbeat; dead connections closed automatically
 */

export interface WebSocketClient {
  send(data: string): void;
  close?(code?: number, reason?: string): void;
  /** Native WS ping frame (e.g. ws.ping() in the 'ws' library). */
  ping?(): void;
}

/**
 * Auth context passed during WS connection setup.
 * Namespace is server-derived from the auth context provider.
 */
export interface WsAuthContext {
  namespace: string;
  /** Optional actor identity for principal-targeted invalidation. */
  actorId?: string;
  /** Optional resolved principal IDs for principal-targeted invalidation. */
  principalIds?: string[];
}

/** WebSocket manager configuration (sourced from DatafnServerConfig.ws). */
export interface WsManagerConfig {
  /** Maximum total simultaneous WS connections. Default: 10,000 */
  maxConnections?: number;
  /** Maximum connections per namespace. Default: 100 */
  maxConnectionsPerNamespace?: number;
  /** Heartbeat ping interval in ms. Default: 30,000 */
  heartbeatIntervalMs?: number;
  /** Max time to wait for pong before closing dead connection. Default: 10,000 */
  heartbeatTimeoutMs?: number;
}

type Message =
  | { type: "hello"; clientId: string; cursor: string; namespace?: string }
  | {
      type: "cursor";
      cursor: string;
      targeting?: {
        mode: "namespace-broadcast" | "targeted";
        degraded: boolean;
        principals?: string[];
      };
    };

export interface CursorBroadcastTargeting {
  affectedPrincipals?: string[];
}

export interface CursorBroadcastResult {
  mode: "namespace-broadcast" | "targeted";
  degraded: boolean;
  wokenClients: number | "all-in-namespace";
}

const DEFAULT_MAX_CONNECTIONS = 10_000;
const DEFAULT_MAX_PER_NAMESPACE = 100;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_HEARTBEAT_TIMEOUT_MS = 10_000;

export class WebSocketManager {
  /**
   * SCA-006: namespace → Set<client> for O(clients-in-namespace) broadcast.
   */
  private namespaceClients = new Map<string, Set<WebSocketClient>>();
  /**
   * PERF-003: namespace → principalId → Set<client> for targeted invalidation.
   */
  private namespacePrincipalClients = new Map<string, Map<string, Set<WebSocketClient>>>();
  /**
   * namespace → clients without principal hints; targeted mode degrades when this is non-empty.
   */
  private namespaceUntargetableClients = new Map<string, Set<WebSocketClient>>();
  /**
   * Reverse mapping: client → namespace for O(1) removeClient.
   */
  private clientNamespace = new Map<WebSocketClient, string>();
  /**
   * Reverse mapping: client → known principalIds for O(1) targeted index cleanup.
   */
  private clientPrincipals = new Map<WebSocketClient, Set<string>>();
  /** Clients that have been sent a ping and have not yet replied (REL-007). */
  private pendingPong = new Set<WebSocketClient>();
  /** Heartbeat interval handle. */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private readonly maxConnections: number;
  private readonly maxConnectionsPerNamespace: number;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly logger?: import("./logger.js").DatafnLogger;

  constructor(config: WsManagerConfig = {}, logger?: import("./logger.js").DatafnLogger) {
    this.logger = logger;
    this.maxConnections = config.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
    this.maxConnectionsPerNamespace =
      config.maxConnectionsPerNamespace ?? DEFAULT_MAX_PER_NAMESPACE;
    this.heartbeatIntervalMs =
      config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.heartbeatTimeoutMs =
      config.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS;
    // Heartbeat is started lazily on first addClient() to avoid creating
    // a setInterval when no clients ever connect.
  }

  private get totalCount(): number {
    return this.clientNamespace.size;
  }

  private getNamespaceCount(namespace: string): number {
    return this.namespaceClients.get(namespace)?.size ?? 0;
  }

  private normalizeNonEmptyString(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private canonicalizeActorPrincipal(actorId: string): string {
    return actorId.includes(":") ? actorId : `user:${actorId}`;
  }

  private closeClientSafely(
    client: WebSocketClient,
    code: number,
    reason: string,
    operation: string,
  ): void {
    if (typeof client.close !== "function") {
      return;
    }
    try {
      client.close(code, reason);
    } catch (error) {
      this.logger?.warn("WebSocket close error", {
        error: String(error),
        operation,
      });
    }
  }

  private resolveClientPrincipals(authContext: WsAuthContext): Set<string> {
    const principals = new Set<string>();
    if (Array.isArray(authContext.principalIds)) {
      for (const principal of authContext.principalIds) {
        const normalized = this.normalizeNonEmptyString(principal);
        if (normalized) {
          principals.add(normalized);
        }
      }
    }
    const actorId = this.normalizeNonEmptyString(authContext.actorId);
    if (actorId) {
      principals.add(this.canonicalizeActorPrincipal(actorId));
    }
    return principals;
  }

  private addTargetingIndexes(
    namespace: string,
    client: WebSocketClient,
    principals: Set<string>,
  ): void {
    this.clientPrincipals.set(client, principals);
    if (principals.size === 0) {
      let untargetable = this.namespaceUntargetableClients.get(namespace);
      if (!untargetable) {
        untargetable = new Set<WebSocketClient>();
        this.namespaceUntargetableClients.set(namespace, untargetable);
      }
      untargetable.add(client);
      return;
    }

    let principalMap = this.namespacePrincipalClients.get(namespace);
    if (!principalMap) {
      principalMap = new Map<string, Set<WebSocketClient>>();
      this.namespacePrincipalClients.set(namespace, principalMap);
    }

    for (const principal of principals) {
      let principalClients = principalMap.get(principal);
      if (!principalClients) {
        principalClients = new Set<WebSocketClient>();
        principalMap.set(principal, principalClients);
      }
      principalClients.add(client);
    }
  }

  private removeTargetingIndexes(client: WebSocketClient, namespace: string): void {
    const principals = this.clientPrincipals.get(client);
    const principalMap = this.namespacePrincipalClients.get(namespace);
    if (principals && principalMap) {
      for (const principal of principals) {
        const principalClients = principalMap.get(principal);
        if (!principalClients) {
          continue;
        }
        principalClients.delete(client);
        if (principalClients.size === 0) {
          principalMap.delete(principal);
        }
      }
      if (principalMap.size === 0) {
        this.namespacePrincipalClients.delete(namespace);
      }
    }

    const untargetable = this.namespaceUntargetableClients.get(namespace);
    if (untargetable) {
      untargetable.delete(client);
      if (untargetable.size === 0) {
        this.namespaceUntargetableClients.delete(namespace);
      }
    }

    this.clientPrincipals.delete(client);
  }

  /** REL-007: Start heartbeat interval. Pings every client; closes those that don't pong. */
  private startHeartbeat() {
    const timeoutMs = this.heartbeatTimeoutMs;
    this.heartbeatTimer = setInterval(() => {
      for (const [client] of this.clientNamespace) {
        if (typeof client.ping !== "function") continue;
        this.pendingPong.add(client);
        try {
          client.ping();
        } catch (e) {
          this.logger?.warn("Heartbeat ping failed", { error: String(e), operation: "ws-heartbeat" });
          this.removeClient(client);
          this.closeClientSafely(client, 1001, "Heartbeat ping failed", "ws-heartbeat-close");
          continue;
        }
        // Per-client pong deadline
        setTimeout(() => {
          if (this.pendingPong.has(client)) {
            this.removeClient(client);
            this.closeClientSafely(client, 1001, "Heartbeat timeout", "ws-heartbeat-timeout-close");
          }
        }, timeoutMs);
      }
    }, this.heartbeatIntervalMs);
    // Allow process to exit naturally — heartbeat must not keep process alive
    (this.heartbeatTimer as NodeJS.Timeout).unref?.();
  }

  /**
   * Add a client after successful authentication.
   *
   * SEC-001: caller must reject unauthenticated connections (WS close 4401) before calling.
   * SEC-002: namespace comes from authContext, never from client messages.
   * SCA-005: connection limits enforced; closes with code 4503 on rejection.
   *
   * @returns true if client was accepted, false if rejected due to limits.
   */
  addClient(client: WebSocketClient, authContext: WsAuthContext): boolean {
    const { namespace } = authContext;

    // SCA-005: Global connection limit
    if (this.totalCount >= this.maxConnections) {
      this.closeClientSafely(client, 4503, "Connection limit reached", "ws-limit-close");
      return false;
    }

    // SCA-005: Per-namespace connection limit
    if (this.getNamespaceCount(namespace) >= this.maxConnectionsPerNamespace) {
      this.closeClientSafely(
        client,
        4503,
        "Namespace connection limit reached",
        "ws-namespace-limit-close",
      );
      return false;
    }

    // SCA-006: Add to namespace-scoped set
    let nsSet = this.namespaceClients.get(namespace);
    if (!nsSet) {
      nsSet = new Set();
      this.namespaceClients.set(namespace, nsSet);
    }
    nsSet.add(client);
    // SEC-002: Server-derived namespace locked in at connection time
    this.clientNamespace.set(client, namespace);
    this.addTargetingIndexes(
      namespace,
      client,
      this.resolveClientPrincipals(authContext),
    );

    // REL-007: Start heartbeat lazily on first connected client
    if (this.heartbeatTimer === null) {
      this.startHeartbeat();
    }

    return true;
  }

  /**
   * Handle disconnection.
   */
  removeClient(client: WebSocketClient) {
    const namespace = this.clientNamespace.get(client);
    if (namespace !== undefined) {
      this.removeTargetingIndexes(client, namespace);
      const nsSet = this.namespaceClients.get(namespace);
      if (nsSet) {
        nsSet.delete(client);
        if (nsSet.size === 0) this.namespaceClients.delete(namespace);
      }
      this.clientNamespace.delete(client);
    }
    this.pendingPong.delete(client);
  }

  /**
   * Handle incoming message.
   * SEC-002: client-supplied namespace in hello messages is ignored.
   */
  handleMessage(client: WebSocketClient, data: string) {
    try {
      const msg = JSON.parse(data) as Message;
      if (msg.type === "hello") {
        // SEC-002: Namespace is already locked in from addClient — ignore msg.namespace
      }
    } catch (e) {
      this.logger?.warn("WebSocket message handling error", { error: String(e), operation: "ws-message" });
    }
  }

  /**
   * Called by the WS transport when a native pong frame is received from a client.
   * REL-007: clears the pending-pong marker so the connection is not timed out.
   */
  handlePong(client: WebSocketClient) {
    this.pendingPong.delete(client);
  }

  /**
   * Broadcast cursor update to all clients in the given namespace.
   * SCA-006: O(clients-in-namespace) — only the namespace Set is iterated.
   */
  broadcastCursor(
    cursor: string,
    namespace: string,
    targeting?: CursorBroadcastTargeting,
  ): CursorBroadcastResult {
    const nsSet = this.namespaceClients.get(namespace);
    if (!nsSet || nsSet.size === 0) {
      return {
        mode: "namespace-broadcast",
        degraded: false,
        wokenClients: 0,
      };
    }

    const requestedPrincipals = new Set<string>();
    for (const principal of targeting?.affectedPrincipals ?? []) {
      const normalized = this.normalizeNonEmptyString(principal);
      if (normalized) {
        requestedPrincipals.add(normalized);
      }
    }

    let recipients: Set<WebSocketClient>;
    let mode: "namespace-broadcast" | "targeted" = "namespace-broadcast";
    let degraded = false;

    if (requestedPrincipals.size === 0) {
      recipients = nsSet;
    } else {
      const principalMap = this.namespacePrincipalClients.get(namespace);
      const hasUntargetableClients =
        (this.namespaceUntargetableClients.get(namespace)?.size ?? 0) > 0;
      const canTarget = !!principalMap && !hasUntargetableClients;

      if (!canTarget) {
        recipients = nsSet;
        degraded = true;
      } else {
        recipients = new Set<WebSocketClient>();
        mode = "targeted";
        for (const principal of requestedPrincipals) {
          const principalClients = principalMap.get(principal);
          if (!principalClients) {
            continue;
          }
          for (const client of principalClients) {
            recipients.add(client);
          }
        }
      }
    }

    const msg = JSON.stringify({
      type: "cursor",
      cursor,
      targeting: {
        mode,
        degraded,
        principals: mode === "targeted" ? Array.from(requestedPrincipals).sort() : undefined,
      },
    });
    for (const client of recipients) {
      try {
        client.send(msg);
      } catch (e) {
        this.logger?.error("Error sending to websocket client", { error: String(e), operation: "ws-broadcast" });
        this.removeClient(client);
        this.closeClientSafely(client, 1001, "Broadcast send failed", "ws-broadcast-close");
      }
    }

    return {
      mode,
      degraded,
      wokenClients: mode === "namespace-broadcast" ? "all-in-namespace" : recipients.size,
    };
  }

  /**
   * Graceful shutdown: stop heartbeat and send WS close code 1001 (Going Away) to all clients.
   * Called by DatafnServer.close().
   */
  close() {
    this.destroy();
    for (const [client] of this.clientNamespace) {
      this.closeClientSafely(client, 1001, "Going Away", "ws-close");
    }
    this.namespaceClients.clear();
    this.namespacePrincipalClients.clear();
    this.namespaceUntargetableClients.clear();
    this.clientNamespace.clear();
    this.clientPrincipals.clear();
    this.pendingPong.clear();
  }

  /**
   * Stop the heartbeat interval without closing any clients.
   */
  destroy() {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
