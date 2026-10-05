# Changelog

## Unreleased

- Resolve the experimental patterns prerequisite through its installed package exports and declarations, not sibling source aliases.
- Make package-local release packing run typecheck, injected-client/model/story tests, and build.
- Declare Node test types and resolve story fixtures relative to the package.

## 0.1.0-experimental.0

- Moved the package to the independently versioned experimental release lane.
- Pinned the independently versioned experimental patterns dependency.
- Declared that failures are reported separately and do not affect stable release status.
