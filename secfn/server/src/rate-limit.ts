import { createRateLimiter } from "@superfunctions/middleware/rate-limit";
import type { RateLimiter } from "@superfunctions/middleware/rate-limit";
import type { AuditService } from "./audit.js";
import type { SecFnRateLimitConfig } from "./types.js";

export interface SecFnRateLimitCheckInput {
  userId?: string;
  ip?: string;
  endpoint?: string;
  tenantId?: string;
  namespace?: string;
}

export interface SecFnRateLimitResult {
  allowed: boolean;
  remaining?: number;
  resetAt?: string;
  scope?: "ip" | "user" | "endpoint";
}

export class SecFnRateLimiter {
  private readonly enabled: boolean;
  private readonly limiter: RateLimiter;
  private readonly limits: Required<Required<SecFnRateLimitConfig>["limits"]>;

  constructor(config: SecFnRateLimitConfig | undefined, private readonly audit: AuditService) {
    if (config?.persistence && !config.singleProcess) throw new Error("persistence requires singleProcess: true; for shared rate limits replace persistence with atomicStore");
    if (config?.persistence && config.atomicStore) throw new Error("Choose one rate-limit storage backend");
    this.enabled = config?.enabled ?? false;
    this.limits = {
      perIP: config?.limits?.perIP ?? 120,
      perUser: config?.limits?.perUser ?? 300,
      perEndpoint: config?.limits?.perEndpoint ?? 60,
    };
    this.limiter = createRateLimiter({
      windowMs: config?.windowMs ?? 60_000,
      maxRequests: Math.max(this.limits.perIP, this.limits.perUser, this.limits.perEndpoint),
      algorithm: config?.algorithm ?? "token-bucket",
      persistence: config?.persistence,
      atomicStore: config?.atomicStore,
      keyPrefix: "secfn:ratelimit:",
    });
  }

  async check(input: SecFnRateLimitCheckInput): Promise<SecFnRateLimitResult> {
    if (!this.enabled) return { allowed: true };

    const checks: Array<{ scope: "ip" | "user" | "endpoint"; key: string; limit: number }> = [];
    if (input.ip) checks.push({ scope: "ip", key: `ip:${input.ip}`, limit: this.limits.perIP });
    if (input.userId) checks.push({ scope: "user", key: `user:${input.userId}`, limit: this.limits.perUser });
    if (input.endpoint && input.ip) {
      checks.push({
        scope: "endpoint",
        key: `endpoint:${input.endpoint}:ip:${input.ip}`,
        limit: this.limits.perEndpoint,
      });
    }

    for (const check of checks) {
      const result = await this.limiter.check({ key: check.key, limit: check.limit });
      if (!result.allowed) {
        await this.audit.write({
          type: "rate_limit_exceeded",
          severity: "medium",
          tenantId: input.tenantId,
          namespace: input.namespace,
          actorId: input.userId,
          ip: input.ip,
          resource: input.endpoint,
          action: "request",
          metadata: { scope: check.scope, key: check.key, limit: check.limit },
        });
        return {
          allowed: false,
          remaining: result.remaining,
          resetAt: result.resetAt,
          scope: check.scope,
        };
      }
    }

    return { allowed: true };
  }
}
