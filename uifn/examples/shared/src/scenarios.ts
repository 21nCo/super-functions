export type ExampleAdapterId = "react" | "svelte" | "solid";

export type ExampleScenarioId =
  | "settings-console"
  | "team-directory"
  | "command-center"
  | "virtualized-results";

export type ExampleCapabilityId =
  | "dialog"
  | "tabs"
  | "switch"
  | "checkbox"
  | "toast"
  | "avatar"
  | "badge"
  | "dropdown-menu"
  | "popover"
  | "hover-card"
  | "combobox"
  | "select"
  | "scroll-area"
  | "context-menu"
  | "virtualized-list";

export type ExampleRouteHash =
  | "#/settings-console"
  | "#/team-directory"
  | "#/command-center"
  | "#/virtualized-results";

export interface ExampleScenarioDefinition {
  id: ExampleScenarioId;
  order: 1 | 2 | 3 | 4;
  title: string;
  description: string;
  supportedAdapters: ExampleAdapterId[];
  requiredCapabilities: ExampleCapabilityId[];
  fixtureKey: "settings" | "team" | "commands" | "results";
}

export const exampleDevPorts = {
  react: 6111,
  svelte: 6112,
  solid: 6114,
} as const;

export const defaultExampleRoute: ExampleRouteHash = "#/settings-console";

const routeByScenarioId: Record<ExampleScenarioId, ExampleRouteHash> = {
  "settings-console": "#/settings-console",
  "team-directory": "#/team-directory",
  "command-center": "#/command-center",
  "virtualized-results": "#/virtualized-results",
};

export const scenarios: ExampleScenarioDefinition[] = [
  {
    id: "settings-console",
    order: 1,
    title: "Settings Console",
    description:
      "Dialog-driven preferences flow with tabs, toggles, checkboxes, and toast feedback.",
    supportedAdapters: ["react", "svelte", "solid"],
    requiredCapabilities: ["dialog", "tabs", "switch", "checkbox", "toast"],
    fixtureKey: "settings",
  },
  {
    id: "team-directory",
    order: 2,
    title: "Team Directory",
    description:
      "Profile and actions flow using avatar, badge, menu, popover, and hover-card primitives.",
    supportedAdapters: ["react", "svelte", "solid"],
    requiredCapabilities: ["avatar", "badge", "dropdown-menu", "popover", "hover-card"],
    fixtureKey: "team",
  },
  {
    id: "command-center",
    order: 3,
    title: "Command Center",
    description:
      "Filtering and command execution flow using combobox, select, scroll-area, and context-menu primitives.",
    supportedAdapters: ["react", "svelte", "solid"],
    requiredCapabilities: ["combobox", "select", "scroll-area", "context-menu"],
    fixtureKey: "commands",
  },
  {
    id: "virtualized-results",
    order: 4,
    title: "Virtualized Results",
    description:
      "Large-result browsing flow proving adapter-level virtualized rendering behavior.",
    supportedAdapters: ["react", "svelte", "solid"],
    requiredCapabilities: ["virtualized-list", "scroll-area"],
    fixtureKey: "results",
  },
];

const knownRoutes = new Set<ExampleRouteHash>(Object.values(routeByScenarioId));

export function normalizeExampleRoute(hash?: string | null): ExampleRouteHash {
  if (!hash || hash === "#") {
    return defaultExampleRoute;
  }

  return knownRoutes.has(hash as ExampleRouteHash)
    ? (hash as ExampleRouteHash)
    : defaultExampleRoute;
}

export function getScenarioRoute(id: ExampleScenarioId): ExampleRouteHash {
  return routeByScenarioId[id];
}
