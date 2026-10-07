# @devfn/compose

Requires Docker Compose 2.24.4 or newer. Starts only declared Compose services with `--no-deps` under a project name whose readable prefix is case folded and whose digest includes the exact prefix and opaque owner bytes; case-distinct prefixes remain separate even if their readable names normalize alike. It replaces source mappings with loopback or explicitly public DevFn host-port mappings while retaining conventional container ports, and never removes persistent volumes during ordinary cleanup. Secret-bearing services disable Docker log persistence.
