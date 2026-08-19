import type { ObservationEvent } from "@superfunctions/observability";

export type SearchFnEventType =
  | "searchfn.authorization.denied"
  | "searchfn.authorization.failed"
  | "searchfn.request.failed";

export type SearchFnAuthorizationDeniedEvent = ObservationEvent<
  "searchfn",
  "searchfn.authorization.denied",
  {
    operation: string;
    adapter: string;
  }
>;

export type SearchFnAuthorizationFailedEvent = ObservationEvent<
  "searchfn",
  "searchfn.authorization.failed",
  {
    operation: string;
    adapter: string;
    errorName?: string;
    errorMessage?: string;
    errorValue?: string;
  }
>;

export type SearchFnRequestFailedEvent = ObservationEvent<
  "searchfn",
  "searchfn.request.failed",
  {
    operation: string;
    adapter: string;
    durationMs: number;
    errorCode: "INTERNAL";
    errorName?: string;
    errorMessage?: string;
    errorValue?: string;
  }
>;

export type SearchFnEvent =
  | SearchFnAuthorizationDeniedEvent
  | SearchFnAuthorizationFailedEvent
  | SearchFnRequestFailedEvent;
