# Releasing Griddle

All four packages use coordinated versions because the adapters import runtime
helpers from core.

## Preflight

From the repository root:

```sh
npm run build
npm test
npm pack --dry-run --workspace @griddle/core
npm pack --dry-run --workspace @griddle/react
npm pack --dry-run --workspace @griddle/vue
npm pack --dry-run --workspace @griddle/svelte
```

Confirm that every package manifest and the lockfile use the intended version,
and that each adapter's `@griddle/core` peer range begins at that version.

## Publish order

Publish core first so the runtime export required by the adapters is available,
then publish the adapters:

```sh
npm publish --workspace @griddle/core
npm publish --workspace @griddle/react
npm publish --workspace @griddle/vue
npm publish --workspace @griddle/svelte
```

After publishing, verify each registry version and install the new Vue and core
versions in Grids. Publishing is intentionally a maintainer-run step and is not
performed by the repository test or build scripts.
