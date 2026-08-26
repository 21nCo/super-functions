# @uifn/components-solid

Framework-isolated Solid styled compounds for the complete uifn catalog. Every styled part delegates behavior and accessibility semantics to `@uifn/solid`.

The package precomposes each primitive as an open compound (`Root`, `Trigger`,
`Content`, and the rest of its documented anatomy) without hiding or forking
headless behavior. Import `@uifn/components/styles.css` once to apply the public
visual defaults.

```tsx
import { Button } from '@uifn/components-solid/button';
import '@uifn/components/styles.css';

<Button.Root class="my-button"><Button.Label>Save</Button.Label></Button.Root>
```

Use the package root for the full catalog or a primitive subpath for the narrowest entry. Styling stays open through `class`, CSS variables, anatomy attributes, and headless state attributes.
