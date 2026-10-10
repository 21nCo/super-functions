# @devfn/processes

Native process groups, durable logs, HTTP/TCP/command/log readiness, PID-birth ownership checks, and graceful termination. It is deliberately browser- and artifact-model-neutral so ProbeFn can adopt it later without depending on DevFn orchestration.

## Gated launches

- `runGatedCommand` runs a command that creates outside resources only after its launcher identity has been recorded. The process wrapper never runs its command without the launch gate channel.
- On POSIX, `gatedLauncherStatus`/`stopGatedLauncher` resolve such a launch only once the launcher and its process group are gone. On Windows they judge and stop only the launcher and its current process tree, so they cannot confirm that a descendant which left that tree is gone.
- `runGatedCommand` redacts the values of `redactKeys` from the command's output and keeps at most `maxBuffer` bytes of each output stream, stopping the launcher's group as soon as either passes it.
- Once the command exits, it waits at most a bounded drain for output that a process it left behind still holds open, then stops that process's group, waiting a bounded time for it to exit and forcing it if needed. A finished command therefore never waits indefinitely on a leftover process. A failed stop is reported together with the command's own outcome, never instead of it.

## Process groups

- Every recorded process and launcher leads its own process group (POSIX), and `processGroupStatus` judges the whole group: a leader that exited while processes remain in its group is `unverified`, not gone, and a reused leader PID (a readable different start identity) proves the group gone, because a PID is not reused while its group exists.
- `stop` signals only a verified leader, waits until its whole group is gone (forcing members that ignore termination), and never signals a live PID whose start identity cannot be read or a leaderless group (`DEVFN_PROCESS_IDENTITY_UNVERIFIED`).
- The group is judged again immediately before each signal. POSIX offers no way to signal a group atomically with that check, but a group ID is not reused while any member remains, so the only exposure is a group that empties and whose ID a new group leader takes in the instant between the check and the signal.
- On Windows, which has no process groups, only the leader is judged and stopped with its process tree.

## Start identities

- Start identities do not depend on the caller's environment: on macOS the `ps` start time is read with `TZ=UTC0` and `LC_ALL=C`.
- A signature recorded by an earlier release in the caller's time zone and locale is never compared as text. It is decided by the record's own UTC time (a receipt process's `startedAt`, a lock's or trust ticket's `createdAt`, a Caddy owner's `startedAt`, a port lease owner's `recordedAt`), which DevFn writes only after reading a live owner's identity:
  - a process whose pinned UTC start is later than that time by more than two seconds is another process reusing the PID;
  - one that started no later than that time is the recorded process;
  - a record without a time, or a start later than it by at most two seconds (the allowance for wall-clock adjustment), is `unverified`.
- An earlier release's active port lease has no `recordedAt`, but its `updatedAt` was written at activation, just after its owner's identity was read, and stays unchanged while the lease is active, so the registry copies it to the owner's `recordedAt` before any transition; a lease whose PID was reused is then `stale` or `externally-occupied` as in earlier releases. Only a lease that already left `active` under an earlier release has no record time, and its owner stays `unverified`.
