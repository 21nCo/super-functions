# @devfn/compose

Starts only declared Compose services with `--no-deps` under a worktree-specific project name, injects loopback or explicitly public DevFn host-port mappings while retaining conventional container ports, and never removes persistent volumes during ordinary cleanup. Secret-bearing services disable Docker log persistence.
