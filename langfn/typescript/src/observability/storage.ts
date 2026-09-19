import { Adapter, WhereClause } from "@superfunctions/db";

import { TraceNotFoundError, ValidationError } from "../core/errors.js";
import { Cost, TokenUsage, TraceScope } from "../core/types.js";
import { secureSha256Hex } from "../utils/random.js";

export interface TraceRecord extends TraceScope {
  traceId: string;
  id?: string;
  kind?: string;
  provider?: string;
  model?: string;
  input?: string;
  output?: string;
  usage?: TokenUsage;
  cost?: Cost;
  metadata?: Record<string, unknown>;
  status?: "ok" | "error";
  error?: Record<string, unknown>;
  createdAt?: number;
}

export interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  metadata?: Record<string, unknown>;
  status: "ok" | "error";
  startedAt: number;
  endedAt: number;
  error?: Record<string, unknown>;
}

export interface FeedbackRecord extends TraceScope {
  scope?: TraceScope;
  traceId: string;
  clientKey?: string;
  rating: number;
  comment?: string;
  metadata?: Record<string, unknown>;
  createdAt?: number;
}

export class TraceStorage {
  readonly supportsScope = true;
  private readonly traceTableName = "langfn_traces";
  private readonly spanTableName = "langfn_trace_spans";
  private readonly feedbackTableName = "langfn_trace_feedback";

  constructor(private readonly db: Adapter) {}

  async save(trace: TraceRecord): Promise<void> {
    await this.saveTrace(trace);
  }

  async saveTrace(trace: TraceRecord): Promise<TraceRecord> {
    const record = {
      ...trace,
      traceId: trace.traceId,
      id: trace.id ?? trace.traceId,
      createdAt: trace.createdAt ?? Date.now()
    };
    await this.db.create({
      model: this.traceTableName,
      data: record
    });
    return record;
  }

  async saveSpan(span: SpanRecord): Promise<SpanRecord> {
    await this.db.create({
      model: this.spanTableName,
      data: span
    });
    return span;
  }

  async saveFeedback(feedback: FeedbackRecord): Promise<FeedbackRecord> {
    const scope: TraceScope = {};
    for (const field of ["tenantId", "userId"] as const) {
      const top = feedback[field];
      const nested = feedback.scope?.[field];
      if (top !== undefined && nested !== undefined && top !== nested) {
        throw new ValidationError(`Conflicting feedback ${field}`);
      }
      scope[field] = top ?? nested;
    }
    const trace = await this.findOne(feedback.traceId, scope);
    if (!trace) {
      throw new TraceNotFoundError(undefined, { metadata: { traceId: feedback.traceId } });
    }

    const record = {
      ...feedback,
      scope,
      tenantId: trace.tenantId,
      userId: trace.userId,
      createdAt: feedback.createdAt ?? Date.now()
    };
    if (feedback.clientKey) {
      const id = `feedback_${await secureSha256Hex(JSON.stringify([
        feedback.traceId,
        feedback.clientKey,
        trace.tenantId ?? null,
        trace.userId ?? null,
      ]))}`;
      return await this.db.upsert<FeedbackRecord>({
        model: this.feedbackTableName,
        where: [{ field: "id", operator: "eq", value: id }],
        conflictTarget: "id",
        create: { ...record, id },
        update: {},
      });
    }

    await this.db.create({
      model: this.feedbackTableName,
      data: record
    });
    return record;
  }

  async listFeedback(traceId: string): Promise<FeedbackRecord[]> {
    return this.db.findMany<FeedbackRecord>({
      model: this.feedbackTableName,
      where: [{ field: "traceId", operator: "eq", value: traceId }],
      orderBy: [{ field: "createdAt", direction: "desc" }]
    });
  }

  async findMany(options: {
    limit?: number;
    offset?: number;
    model?: string;
    provider?: string;
    tenantId?: string;
    userId?: string;
  } = {}): Promise<TraceRecord[]> {
    const where: WhereClause[] = scopeWhere(options);
    if (options.model) {
      where.push({ field: "model", operator: "eq", value: options.model });
    }
    if (options.provider) {
      where.push({ field: "provider", operator: "eq", value: options.provider });
    }

    return this.db.findMany<TraceRecord>({
      model: this.traceTableName,
      where,
      limit: options.limit,
      offset: options.offset,
      orderBy: [{ field: "createdAt", direction: "desc" }]
    });
  }

  async findOne(traceId: string, scope?: TraceScope): Promise<TraceRecord | null> {
    return this.db.findOne<TraceRecord>({
      model: this.traceTableName,
      where: [{ field: "traceId", operator: "eq", value: traceId }, ...scopeWhere(scope)]
    });
  }
}

function scopeWhere(scope?: TraceScope): WhereClause[] {
  return (["tenantId", "userId"] as const).flatMap(field =>
    scope?.[field] === undefined ? [] : [{ field, operator: "eq" as const, value: scope[field] }]
  );
}
