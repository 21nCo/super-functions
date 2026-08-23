import type { ExampleAdapterId, ExampleCapabilityId } from "./scenarios.js";

export interface ExampleCapabilitySupport {
  adapter: ExampleAdapterId;
  capability: ExampleCapabilityId;
  status: "supported" | "unsupported";
  note?: string;
}

export const capabilitySupport: ExampleCapabilitySupport[] = [
  { adapter: "react", capability: "dialog", status: "supported" },
  { adapter: "react", capability: "tabs", status: "supported" },
  { adapter: "react", capability: "switch", status: "supported" },
  { adapter: "react", capability: "checkbox", status: "supported" },
  { adapter: "react", capability: "toast", status: "supported" },
  { adapter: "react", capability: "avatar", status: "supported" },
  { adapter: "react", capability: "badge", status: "supported" },
  { adapter: "react", capability: "dropdown-menu", status: "supported" },
  { adapter: "react", capability: "popover", status: "supported" },
  { adapter: "react", capability: "hover-card", status: "supported" },
  { adapter: "react", capability: "combobox", status: "supported" },
  { adapter: "react", capability: "select", status: "supported" },
  { adapter: "react", capability: "scroll-area", status: "supported" },
  { adapter: "react", capability: "context-menu", status: "supported" },
  { adapter: "react", capability: "virtualized-list", status: "supported" },

  { adapter: "svelte", capability: "dialog", status: "supported" },
  { adapter: "svelte", capability: "tabs", status: "supported" },
  { adapter: "svelte", capability: "switch", status: "supported" },
  { adapter: "svelte", capability: "checkbox", status: "supported" },
  { adapter: "svelte", capability: "toast", status: "supported" },
  { adapter: "svelte", capability: "avatar", status: "supported" },
  { adapter: "svelte", capability: "badge", status: "supported" },
  { adapter: "svelte", capability: "dropdown-menu", status: "supported" },
  { adapter: "svelte", capability: "popover", status: "supported" },
  { adapter: "svelte", capability: "hover-card", status: "supported" },
  { adapter: "svelte", capability: "combobox", status: "supported" },
  { adapter: "svelte", capability: "select", status: "supported" },
  { adapter: "svelte", capability: "scroll-area", status: "supported" },
  { adapter: "svelte", capability: "context-menu", status: "supported" },
  { adapter: "svelte", capability: "virtualized-list", status: "supported" },

  { adapter: "solid", capability: "dialog", status: "supported" },
  { adapter: "solid", capability: "tabs", status: "supported" },
  { adapter: "solid", capability: "switch", status: "supported" },
  { adapter: "solid", capability: "checkbox", status: "supported" },
  { adapter: "solid", capability: "toast", status: "supported" },
  { adapter: "solid", capability: "avatar", status: "supported" },
  { adapter: "solid", capability: "badge", status: "supported" },
  { adapter: "solid", capability: "dropdown-menu", status: "supported" },
  { adapter: "solid", capability: "popover", status: "supported" },
  { adapter: "solid", capability: "hover-card", status: "supported" },
  { adapter: "solid", capability: "combobox", status: "supported" },
  { adapter: "solid", capability: "select", status: "supported" },
  { adapter: "solid", capability: "scroll-area", status: "supported" },
  { adapter: "solid", capability: "context-menu", status: "supported" },
  { adapter: "solid", capability: "virtualized-list", status: "supported" },

];

export function getCapabilitySupport(adapter: ExampleAdapterId, capability: ExampleCapabilityId): ExampleCapabilitySupport {
  return capabilitySupport.find((entry) => entry.adapter === adapter && entry.capability === capability) ?? {
    adapter,
    capability,
    status: "unsupported",
    note: "Capability is not declared in the Workbench capability matrix.",
  };
}
