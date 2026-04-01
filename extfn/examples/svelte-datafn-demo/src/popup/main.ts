import { mountSveltePage } from "@superfunctions/extfn-svelte";
import PopupApp from "./PopupApp.svelte";

mountSveltePage(PopupApp, {
  props: {
    clientId: "popup:svelte-datafn-demo",
    context: {
      context: "popup",
      surfaceId: "main-popup",
    },
    heading: "Popup notes",
  },
});
