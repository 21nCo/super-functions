import { mount } from "svelte";
import App from "./App.svelte";
import "@uifn/components/styles.css";
import "./styles.css";

mount(App, {
  target: document.getElementById("app")!,
});
