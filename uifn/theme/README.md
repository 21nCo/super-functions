# @uifn/theme

Runtime CSS variable mounting, theme providers, scoped themes, and media preference sync for `uifn`.

`@uifn/theme` consumes semantic token contracts from `@uifn/tokens` and keeps CSS variables as the runtime source of truth.

Themes can be mounted globally, into scoped roots, or into shadow roots through adopted stylesheets. Runtime switching only changes CSS variables; it does not require rebuilding Tailwind output.

Status: `ga-candidate`.
