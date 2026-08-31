# `@mdfn/contentfn`

Defines Markdown as a versioned content kind and carries its dialect, raw-HTML
policy, extension set, schema version/hash, canonical source, and sidecar as an
explicit profile envelope.

Migration helpers upgrade strings and legacy Markdown envelopes without source
loss. Known rich-text blocks are projected to Markdown; unsupported blocks are
retained as inert encoded migration comments and produce loss diagnostics.
