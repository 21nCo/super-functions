# Controller API

`@uifn/core` owns framework-neutral state, transitions, actions, snapshots, controlled synchronization, form reset/validation bridges, and deterministic serialization. Framework adapters own lifecycle and DOM binding. Applications should dispatch catalog-declared events and read state/actions/parts rather than reaching into private controller fields.
