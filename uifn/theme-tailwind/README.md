# @uifn/theme-tailwind

Tailwind preset and plugin generation for `uifn` semantic tokens, runtime themes, and typed recipes.

Tailwind v3/v4 integration is optional and generated from the CSS-variable token contract. It is not the runtime source of truth.

The preset emits statically discoverable recipe utilities such as `uifn-button`, `uifn-surface`, and `uifn-hover--stripe`; dynamic class fragments are rejected.

`createTailwindPreset()` returns directly executable Tailwind plugin objects.
The `utilities` field remains available as inspectable build metadata, while
Tailwind invokes each plugin's `handler` to register the same static utilities.

Status: `ga-candidate`.
