import { mountSveltePage } from "@extfn/svelte";
import OptionsApp from "./OptionsApp.svelte";

mountSveltePage(OptionsApp, {
  props: {
    clientId: "options:svelte-datafn-demo",
    context: {
      context: "options",
      surfaceId: "settings",
    },
  },
});
