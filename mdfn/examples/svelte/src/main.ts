import { mount } from "svelte";
import App from "./App.svelte";
import "@uifn/components/styles.css";
import "@mdfn/components/styles.css";
import "../../shared.css";

mount(App, { target: document.querySelector<HTMLElement>("#app")! });
