# MDFN framework examples

These apps mount the same Markdown authoring workflow through each supported
framework adapter. Every example includes the complete authoring shell, a live
Markdown readout, file insertion, review controls, and document reset behavior.

```bash
npm run dev --workspace=mdfn-example-react
npm run dev --workspace=mdfn-example-svelte
npm run dev --workspace=mdfn-example-solid
```

Build and exercise all three apps in Chromium, Firefox, WebKit, and a mobile
Chromium viewport with:

```bash
npm run verify:mdfn-examples
```

The browser probe writes per-step screenshots, captured runtime events, failure
HTML, and a machine-readable result into the ignored
`mdfn/examples/test-results/` directory.
