<script lang="ts">
  import {
    Avatar,
    AvatarFallback,
    AvatarImage,
    Badge,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
    Popover,
    PopoverContent,
    PopoverTrigger,
  } from "@uifn/svelte";
  import {
    getScenarioRoute,
    teamMembers,
    type ExampleRouteHash,
    type TeamMemberFixture,
  } from "@uifn/examples-shared";

  export let route: ExampleRouteHash;

  const memberNoteById: Record<string, string> = {
    "team-amy-chen": "Pair the new rollout with a concise motion audit before sign-off.",
    "team-liam-jones": "Confirm the hash-route fallback before cutting the walkthrough video.",
    "team-noah-singh": "Run the keyboard smoke after the final scenario copy is in place.",
  };

  function getAvatarSrc(member: TeamMemberFixture) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="#d7e6ef"/><text x="48" y="58" text-anchor="middle" font-size="28" font-family="Trebuchet MS" fill="#17445f">${member.initials}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
</script>

<div class="scenario-stack" data-route={route}>
  <div class="results-summary">
    <div>
      <p class="section-label">Shared team fixture</p>
      <h3>Three cross-functional teammates</h3>
    </div>
    <p class="scenario-description">
      This scenario combines display primitives with action surfaces so the shell stays useful on
      both pointer and keyboard paths.
    </p>
  </div>

  <div class="member-grid">
    {#each teamMembers as member (member.id)}
      <article class="member-card">
        <div class="member-topline">
          <div class="member-identity">
            <Avatar class="member-avatar">
              <AvatarImage src={getAvatarSrc(member)} alt={`${member.name} avatar`} class="member-avatar-image" />
              <AvatarFallback class="member-avatar-fallback">{member.initials}</AvatarFallback>
            </Avatar>

            <div class="member-copy">
              <HoverCard openDelay={90} closeDelay={90}>
                <HoverCardTrigger class="member-link" href={getScenarioRoute("team-directory")}>
                  {member.name}
                </HoverCardTrigger>
                <HoverCardContent class="floating-card">
                  <strong>{member.role}</strong>
                  <p>{member.location}</p>
                  <small>Status: {member.status}</small>
                </HoverCardContent>
              </HoverCard>
              <p class="member-role">{member.role}</p>
            </div>
          </div>

          <Badge class={`member-badge status-${member.status}`}>{member.status}</Badge>
        </div>

        <p class="member-location">Based in {member.location}</p>

        <div class="member-actions">
          <Popover>
            <PopoverTrigger class="ghost-button" aria-label={`View handoff note for ${member.name}`}>
              View handoff
            </PopoverTrigger>
            <PopoverContent class="floating-card">
              <strong>{member.name}</strong>
              <p>{memberNoteById[member.id]}</p>
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger class="primary-button" aria-label={`Open actions for ${member.name}`}>
              Actions
            </DropdownMenuTrigger>
            <DropdownMenuContent class="floating-card">
              <DropdownMenuLabel>{member.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Message teammate</DropdownMenuItem>
              <DropdownMenuItem>Review example route</DropdownMenuItem>
              <DropdownMenuItem>Share status update</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </article>
    {/each}
  </div>
</div>
