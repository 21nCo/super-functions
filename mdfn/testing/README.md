# @mdfn/testing

Reusable preservation, rendering-security, extension, adapter-trace, official
CommonMark, fuzz, performance, mounted-framework, real-browser, SSR, runtime
export, and packed-consumer conformance helpers.

## Large-document performance budget

The large-document test builds a ~200k-character fixture and times the full
`parseMarkdown` → `serializeMarkdown` → `renderHtml` pipeline. Local development
must stay under **5s**; CI shared runners use a **12s** ceiling because the
same work routinely takes ~9s on GHA.
