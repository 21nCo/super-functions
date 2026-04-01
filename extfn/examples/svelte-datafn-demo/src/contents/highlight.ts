import { mountSvelteContent } from "@superfunctions/extfn-svelte";
import HighlightCard from "./HighlightCard.svelte";

const host = document.createElement("div");
host.setAttribute("data-extfn-datafn-highlight", "true");
document.body.append(host);

mountSvelteContent(HighlightCard, host, {
  props: {
    clientId: "content:svelte-datafn-demo",
  },
});
