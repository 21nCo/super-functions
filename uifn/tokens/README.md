# @uifn/tokens

Semantic design token schema, validation, token transforms, and OKLCH utilities for `uifn`.

This package is the source of truth for public token names and theme token validation. Runtime mounting lives in `@uifn/theme`, Tailwind integration lives in `@uifn/theme-tailwind`, and recipes live in `@uifn/recipes`.

Public tokens are semantic W3C Design Tokens-style entries such as `color.surface.canvas`, `color.text.primary`, `color.accent.solid`, `radius.md`, and `motion.easing.standard`. Cryptic public aliases and incomplete required semantic groups are rejected by validation.

Status: `ga-candidate`.
