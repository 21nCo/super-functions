# @mdfn/render

Environment-neutral HTML and render-tree output. `renderHtml` requires an explicit
sanitizer for raw HTML, rejects unsafe URL schemes, and enforces resource limits.
`renderTree` returns an unfiltered tree and does not enforce those safety or
resource checks; hosts must validate URLs, sanitize content, and bound traversal
before rendering a tree from untrusted input.
