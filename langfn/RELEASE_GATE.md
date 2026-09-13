# LangFn TypeScript adoption release gate

Release line: 0.1.0. Run `npm run gate:langfn-release` from repo root.
The TypeScript adoption checks `npm --prefix langfn/typescript run build`, type checking against real shared package declarations, the complete TypeScript suite, and built package imports. Python remains in the next source repository and is outside this TypeScript consumer adoption. Live Gemini verification is separately required before release readiness.

HTTP trace listing and feedback require an authenticated actor. Trace records persist `tenantId` and `userId` from trusted session metadata; SQL-backed custom trace stores must include those columns and apply both query predicates. Historical unowned traces are excluded from HTTP results. Direct trusted SDK access remains available for maintenance. HTTP provider errors omit upstream bodies and metadata.
