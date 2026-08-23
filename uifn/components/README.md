# @uifn/components

Framework-neutral styled component contracts, CSS, recipes, and catalog metadata for uifn.

This stable package has no UI-framework dependency or peer. Framework-native styled compounds live in `@uifn/components-react`, `@uifn/components-svelte`, and `@uifn/components-solid`.

This is the only stable package that owns uifn's public visual defaults. It
never owns component behavior. `@uifn/core` remains permanently unstyled and
the React, Svelte, and Solid adapters remain permanently headless.

The neutral layer consumes semantic tokens from `@uifn/tokens`, runtime theme contracts from `@uifn/theme`, and typed recipes from `@uifn/recipes`.

Import `@uifn/components/styles.css` once to install the framework-neutral CSS layers. The stylesheet targets anatomy parts and headless state attributes, supports density and RTL, and includes forced-colors and reduced-motion fallbacks. Consumer CSS can override it through normal cascade layers and custom properties.

Status: `ga-candidate`.
