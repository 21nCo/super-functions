# Migration

The current stable matrix is React, Svelte, and Solid. Previous experimental Vue and Angular adapters were removed and are not supported. Migrate behavior to the framework-neutral controller contract, then replace adapter imports with the corresponding stable framework package. Legacy `StateMachine` and `createMachine` APIs are removed; use the generated primitive controller exports documented by the canonical catalog.
