export interface SettingsSectionFixture {
  id: string;
  title: string;
  description: string;
  defaultOpen: boolean;
}

export interface SettingsToggleFixture {
  id: string;
  sectionId: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

export interface TeamMemberFixture {
  id: string;
  name: string;
  role: string;
  status: "active" | "away" | "offline";
  initials: string;
  location: string;
}

export interface CommandItemFixture {
  id: string;
  title: string;
  group: "Navigation" | "Creation" | "Maintenance";
  shortcut: string;
}

export interface ResultRowFixture {
  id: string;
  label: string;
  category: "alerts" | "changes" | "events";
}

export const settingsSections: SettingsSectionFixture[] = [
  {
    id: "general",
    title: "General",
    description: "Shared workspace preferences and default behaviors.",
    defaultOpen: true,
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Signal routing and acknowledgement preferences.",
    defaultOpen: false,
  },
  {
    id: "security",
    title: "Security",
    description: "Session and approval behavior for privileged actions.",
    defaultOpen: false,
  },
];

export const settingsToggles: SettingsToggleFixture[] = [
  {
    id: "compact-mode",
    sectionId: "general",
    label: "Compact mode",
    description: "Reduce spacing density inside the settings console.",
    defaultEnabled: false,
  },
  {
    id: "toast-confirmation",
    sectionId: "notifications",
    label: "Toast confirmation",
    description: "Show a toast after preferences are applied.",
    defaultEnabled: true,
  },
  {
    id: "approval-prompts",
    sectionId: "security",
    label: "Approval prompts",
    description: "Require confirmation before high-impact actions.",
    defaultEnabled: true,
  },
];

export const teamMembers: TeamMemberFixture[] = [
  {
    id: "team-amy-chen",
    name: "Amy Chen",
    role: "Design Systems Lead",
    status: "active",
    initials: "AC",
    location: "Singapore",
  },
  {
    id: "team-liam-jones",
    name: "Liam Jones",
    role: "Frontend Engineer",
    status: "away",
    initials: "LJ",
    location: "London",
  },
  {
    id: "team-noah-singh",
    name: "Noah Singh",
    role: "Accessibility QA",
    status: "offline",
    initials: "NS",
    location: "Bengaluru",
  },
];

export const commandItems: CommandItemFixture[] = [
  {
    id: "open-settings",
    title: "Open settings console",
    group: "Navigation",
    shortcut: "G then S",
  },
  {
    id: "create-workspace",
    title: "Create workspace",
    group: "Creation",
    shortcut: "C then W",
  },
  {
    id: "clear-caches",
    title: "Clear local caches",
    group: "Maintenance",
    shortcut: "X then C",
  },
];

export const resultRows: ResultRowFixture[] = Array.from({ length: 120 }, (_, index) => {
  const row = index + 1;
  const category = row % 3 === 1 ? "alerts" : row % 3 === 2 ? "changes" : "events";

  return {
    id: `result-${row.toString().padStart(3, "0")}`,
    label: `Result row ${row.toString().padStart(3, "0")}`,
    category,
  };
});
