import { defineExtension } from "@superfunctions/extfn";

export default defineExtension({
  name: "Svelte DataFn Demo",
  version: "0.1.0",
  targets: ["chromium-mv3"],
  background: {
    serviceWorker: "./src/background/index.ts",
  },
  popup: {
    entry: "./src/popup/popup.html",
    title: "DataFn Popup",
  },
  options: {
    entry: "./src/options/options.html",
    title: "DataFn Options",
  },
  contentScripts: [
    {
      id: "datafn-highlights",
      entry: "./src/contents/highlight.ts",
      matches: ["https://*/*"],
      anchors: [
        {
          kind: "selector-list",
          selector: "body",
          mountMode: "append",
        },
      ],
    },
  ],
});
