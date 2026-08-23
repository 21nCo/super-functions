# @uifn/recipes

Typed style recipes for `uifn` components and patterns.

Recipes return class names, CSS variables, inline style objects, and data attributes so consumers can use Tailwind, plain CSS, CSS Modules, or framework-native styling.

Prefer semantic surface names in public component APIs:

```ts
surface('raised');
buttonRecipe({ surface: 'raised' });
```

Numeric depth is supported for layered internal UI and is range-checked:

```ts
surface({ depth: 2 });
buttonRecipe({ surfaceDepth: 2 });
```

Hover effects are explicit. `tint` is the default; `stripe` is available as an opt-in recipe effect.

Status: `ga-candidate`.
