# LangFn TypeScript adoption release gate

Release line: 0.1.0. Run `npm run gate:langfn-release` from repo root.
The TypeScript adoption checks `npm --prefix langfn/typescript run build`, type checking against real shared package declarations, the complete TypeScript suite, and built package imports. Python remains in the next source repository and is outside this TypeScript consumer adoption. Live Gemini verification is separately required before release readiness.
