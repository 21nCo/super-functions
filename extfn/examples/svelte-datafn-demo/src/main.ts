import App from "./App.svelte";

const target = document.querySelector("#app");

if (target) {
  new App({
    target
  });
}
