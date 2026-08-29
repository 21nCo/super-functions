# MailFn consumer contracts

These compile-only fixtures keep the reusable boundary honest:

- `router-cloudflare.ts` models Router's Cloudflare Worker service shape and composes MailFn with SendFn without importing MailFn internals.
- `framework-neutral.ts` proves an unrelated application can use the provider-neutral in-memory core and typed HTTP client.

The MailFn release gate copies both fixtures into the clean tarball-install project and typechecks them there. They are validation inputs, not published packages and not production deployment configuration.
