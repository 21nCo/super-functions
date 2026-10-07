import {
  DATAFN_ROUTE_MAX_TTL_MS, validateDatafnRegionalEndpoint,
  type DatafnRegionalRouteDescriptor, type DatafnRouteProvider,
} from "@datafn/core";

// Allow bounded issuer/client clock differences when validating the maximum TTL.
const DESCRIPTOR_CLOCK_SKEW_MS = 5000;

export class DatafnRegionalTransportError extends Error {
  constructor(readonly code: "DATAFN_ROUTE_BOOTSTRAP_UNAVAILABLE" | "DATAFN_ROUTE_DESCRIPTOR_INVALID" |
    "DATAFN_ROUTE_DISPOSED" | "DATAFN_REGIONAL_ENDPOINT_UNAVAILABLE") {
    super(code);
    this.name = "DatafnRegionalTransportError";
  }
}

/** One in-memory route per client/auth context. Never persists descriptors or tickets. */
export class DatafnRegionalRouteCache {
  private current?: Readonly<DatafnRegionalRouteDescriptor>;
  private pending?: Promise<Readonly<DatafnRegionalRouteDescriptor>>;
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private listeners = new Set<() => void>();
  constructor(private provider: DatafnRouteProvider, private now = Date.now) {}

  async get(): Promise<Readonly<DatafnRegionalRouteDescriptor>> {
    if (this.disposed) throw new DatafnRegionalTransportError("DATAFN_ROUTE_DISPOSED");
    if (this.current && this.current.expiresAt > this.now()) {
      if (this.current.renewAfter <= this.now()) void this.refresh(true).catch(() => {});
      return this.current;
    }
    // Expiry must supersede renewal even before the deadline timer gets CPU time.
    if (this.current) this.invalidate(this.current);
    return this.refresh(false);
  }

  /** Ignore delayed failures from a route already superseded by renewal. */
  invalidate(route?: Readonly<DatafnRegionalRouteDescriptor>): void {
    if (route && route !== this.current) return;
    this.generation++;
    this.current = undefined;
    this.pending = undefined;
    clearTimeout(this.timer);
    clearTimeout(this.expiryTimer);
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    this.invalidate();
  }

  private notify(): void {
    for (const listener of this.listeners) { try { listener(); } catch {} }
  }

  private refresh(renew: boolean): Promise<Readonly<DatafnRegionalRouteDescriptor>> {
    if (this.pending) return this.pending;
    const generation = this.generation;
    const pending = Promise.resolve().then(() => renew ? this.provider.renew() : this.provider.bootstrap())
      .then(async descriptor => {
        if (this.disposed) throw new DatafnRegionalTransportError("DATAFN_ROUTE_DISPOSED");
        if (generation !== this.generation) return this.get();
        const now = this.now();
        try {
          if (!descriptor || descriptor.version !== 1 || typeof descriptor.ticket !== "string" ||
            !/^[A-Za-z0-9_.-]{1,16384}$/.test(descriptor.ticket) ||
            !Number.isSafeInteger(descriptor.expiresAt) || !Number.isSafeInteger(descriptor.renewAfter) ||
            descriptor.expiresAt <= now || descriptor.expiresAt > now + DATAFN_ROUTE_MAX_TTL_MS + DESCRIPTOR_CLOCK_SKEW_MS ||
            descriptor.renewAfter >= descriptor.expiresAt || descriptor.renewAfter <= now) throw new Error();
          const next = Object.freeze({ ...descriptor,
            httpUrl: validateDatafnRegionalEndpoint(descriptor.httpUrl),
            ...(descriptor.wsUrl ? { wsUrl: validateDatafnRegionalEndpoint(descriptor.wsUrl, true) } : {}),
          });
          this.current = next;
          clearTimeout(this.expiryTimer);
          this.expiryTimer = setTimeout(() => this.invalidate(next), next.expiresAt - now);
          (this.expiryTimer as unknown as { unref?: () => void }).unref?.();
          this.schedule(Math.max(100, next.renewAfter - now));
          this.notify();
          return next;
        } catch {
          throw new DatafnRegionalTransportError("DATAFN_ROUTE_DESCRIPTOR_INVALID");
        }
      }).catch(error => {
        if (!this.disposed && generation === this.generation && this.current) {
          if (this.current.expiresAt <= this.now()) {
            this.current = undefined;
            this.notify();
          } else {
            this.schedule(Math.min(1000, this.current.expiresAt - this.now()));
          }
        }
        if (error instanceof DatafnRegionalTransportError) throw error;
        throw new DatafnRegionalTransportError("DATAFN_ROUTE_BOOTSTRAP_UNAVAILABLE");
      }).finally(() => {
        if (this.pending === pending) this.pending = undefined;
      });
    this.pending = pending;
    return pending;
  }

  private schedule(delay: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.disposed) return;
      if (this.current && this.current.expiresAt <= this.now()) {
        this.invalidate(this.current);
        return;
      }
      void this.refresh(true).catch(() => {});
    }, delay);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }
}

/** Canonical POST provider; never submits a cached region/endpoint as routing authority. */
export function createDatafnHttpRouteProvider(options: {
  bootstrapUrl: string;
  fetch?: typeof fetch;
  headers?: () => HeadersInit | Promise<HeadersInit>;
  credentials?: RequestCredentials;
}): DatafnRouteProvider {
  const url = validateDatafnRegionalEndpoint(options.bootstrapUrl);
  const load = async (): Promise<DatafnRegionalRouteDescriptor> => {
    const response = await (options.fetch ?? globalThis.fetch)(url, {
      method: "POST", headers: await options.headers?.(),
      credentials: options.credentials ?? "same-origin", cache: "no-store", redirect: "error",
    });
    if (!response.ok) throw new DatafnRegionalTransportError("DATAFN_ROUTE_BOOTSTRAP_UNAVAILABLE");
    return response.json();
  };
  return { bootstrap: load, renew: load };
}
