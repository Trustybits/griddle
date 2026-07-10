# Publishing Plan: `@griddle/*` to npm

Goal: publish `@griddle/core`, `@griddle/react`, `@griddle/vue`, and
`@griddle/svelte` to npm under the **`@griddle`** organization, with a real
build step for every package (including Vue and Svelte) so consumers install
compiled, stable artifacts.

## Status: ✅ Executed — ready to publish

This plan has been **fully implemented and verified**. All decisions (marked
**DECISION (made)** inline, summarized in §8) are resolved and applied. Every
package builds to a clean tarball, metadata is complete, versions are lockstep
at `0.1.0`, and `npm publish --dry-run --workspaces` passes with no errors
(4 publishable, 3 demos correctly skipped as private).

Verified end-to-end: clean rebuild from scratch, core tests (50/50), all demos
build, Svelte 5 compat re-checked against the shipped `dist/*.svelte`, and the
publisher (`trustybits`) confirmed as owner of the `@griddle` org.

**The only remaining step is the manual first publish** (§5.1 / §7 step 7).
See §7 for the per-step completion status.

Sub-decisions settled during execution: the public loop-component name is
**`GriddleLoopGrid`** (§6); the `docs/` files are **referenced via repo links**
in the per-package READMEs rather than bundled (npm omits repo-root `docs/`).

---

## 1. Current state (what the audit found)

> **Note:** this section is the **pre-implementation audit** (a historical
> snapshot). It has since been fully addressed — see the Status banner above and
> §7 for what was done.

| Package | Build today | Output | Publish-ready? |
| --- | --- | --- | --- |
| `@griddle/core` | `tsc -p tsconfig.json` → `dist/` | `.js` + `.d.ts` + maps | Close — metadata gaps only |
| `@griddle/react` | `tsc -p tsconfig.json` → `dist/` | `.js` + `.d.ts` + maps | Close — metadata gaps only |
| `@griddle/vue` | `echo` stub (no build) | ships raw `src/*.vue` | **No** — no build, no types |
| `@griddle/svelte` | `echo` stub (no build) | ships raw `src/*.svelte` | **No** — no build, no types |

Key facts:

- Root `package.json` is `private: true` with npm workspaces (`packages/*`,
  `demos/*`). It will **not** be published — good.
- All three `demos/*` are `private: true` — they will not be published — good.
- `@griddle/core` must stay **dependency-free**; adapters depend on their
  framework as a **peer** dependency only (per `AGENTS.md`). The plan preserves
  this.
- Node in this environment: v24; npm v11. `vue-tsc`, `vite`,
  `vite-plugin-svelte`, and `@vitejs/plugin-vue` are already in `node_modules`;
  `@sveltejs/package` is **not** yet installed. (Even hoisted deps must still be
  declared explicitly in each package's `package.json` devDeps for a reproducible
  build — see §2.3/§2.4.)
- Core and React build cleanly today (`npm run build` at root succeeds).

### 1a. Blocking cleanup — tracked scratch files

These `.fix` / `.head` / `.clean` files are **committed to git** and violate
`AGENTS.md` ("never write scratch copies of source into tracked directories").
They must be removed before any publish:

```
packages/core/src/positioning.ts.head
packages/core/src/types.ts.fix
packages/react/src/GriddleGrid.tsx.fix
packages/svelte/src/GriddleGrid.svelte.clean
packages/svelte/src/GriddleGrid.svelte.fix
demos/vue/src/ConfigPanel.vue.fix
demos/vue/src/DemoTile.vue.fix
```

> Critical for Core/React: `files` includes `"src"`, so `types.ts.fix` and
> `positioning.ts.head` would be **published to npm** as-is. Must delete first.

Action: `git rm` all seven, confirm each has a real counterpart already tracked
(they do), and verify `git status --porcelain` is clean afterward.

---

## 2. Build strategy per package

The central technical decision. "Build" means different things across these
ecosystems — plain-JS compilation is right for core/react, but **not** for Vue
and Svelte component libraries.

### 2.1 `@griddle/core` — keep `tsc`

No change to the build mechanism. Already emits `.js` + `.d.ts` + maps to
`dist/`. Only metadata/hygiene changes (Section 3).

- **DECISION (made): ship `src/` **and** `dist/`.** `files` keeps
  `["dist", "src"]`. The build emits `.js.map` and `.d.ts.map`
  (`sourceMap`/`declarationMap` are on in `tsconfig.base.json`), and those maps
  contain relative references back into `src/*.ts`. Shipping `src` keeps those
  references valid so consumers get "go to definition" into the real annotated
  TypeScript and debugger step-through into original source. The ~152 KB of
  extra tarball size is an accepted trade-off. **Do not** drop to `["dist"]`
  without also disabling map emit, or the published maps would dangle. Apply the
  same `["dist", "src"]` choice to React for consistency.

### 2.2 `@griddle/react` — keep `tsc`

No mechanism change. `.tsx` → `.js` + `.d.ts` via `tsc` already works. Metadata
only.

### 2.3 `@griddle/vue` — Vite library mode **(DECISION made: Option A)**

`.vue` single-file components **cannot** be compiled to plain `.js` by `tsc`.
**Decision: build with Vite in library mode** — compile the SFCs to plain JS at
publish time and generate types, so consumers get a fully compiled library that
works without their own SFC toolchain.

Why (over shipping raw `.vue` source): it satisfies "builds before being
published and is stable" directly, type-checks the SFCs at publish time via
`vue-tsc`, and doesn't push a Vue SFC-compiler requirement onto consumers
(tests, SSR, and non-Vite bundlers all work). The consumer-facing API — imports,
props, the `#tile` slot, events, and `useGriddle` — is identical either way; the
only difference is that Option A "just works" in more environments. This package
is well-suited to it: there are **no `<style>` blocks** (no CSS extraction to
handle) and `GriddleGrid.vue` imports `LoopGrid.vue` (SFC-imports-SFC), which
gets resolved into the bundle at publish time instead of at the consumer.

Build shape:
- `vite build` with `@vitejs/plugin-vue`; **externalize** `vue` and
  `@griddle/core` (keep core a peer dep, don't bundle it); output ESM to `dist/`.
- Generate `.d.ts` via `vue-tsc --declaration --emitDeclarationOnly` (already
  available) or `vite-plugin-dts`.
- Add `packages/vue/tsconfig.json` (currently **missing**) extending
  `tsconfig.base.json`, for `vue-tsc` type generation and IDE support.
- Add a `vite.config.ts` for the library build (devDeps: `vite`,
  `@vitejs/plugin-vue`).
- Replace the `echo` build script with the real build.
- Update `main`/`module`/`types`/`exports` to point at `dist/`, not `src/`.

### 2.4 `@griddle/svelte` — add `@sveltejs/package` **(standard tool)**

The canonical Svelte library build is the **`svelte-package`** CLI from
`@sveltejs/package`. It preprocesses `.svelte`/`.ts` and emits `.d.ts` into
`dist/`. (Note: Svelte libraries ship *processed component source*, not bundled
JS — the consumer's Svelte compiler finishes the job. This is correct and is
still a genuine build step.)

- Add devDeps: `@sveltejs/package`, `svelte2tsx`, `svelte-check`, and a Svelte
  version to build against (currently `^4.2.0`; see peer-range decision below).
- Add `packages/svelte/tsconfig.json` (currently **missing**) or an
  `svelte.config.js` as `svelte-package` expects. **The Svelte tsconfig must set
  `verbatimModuleSyntax: true`** — this overrides `tsconfig.base.json`'s `false`.
  The Svelte 5 smoke test (below) surfaced that Svelte now *requires* this option
  for `.svelte` files with `lang="ts"`.
- Replace the `echo` build with `svelte-package`.
- Update `svelte`/`exports`/`types` to point at `dist/`.
- Keep `svelte` as a **peer** dependency.

- **DECISION (made): keep Svelte peer range `^4.0.0 || ^5.0.0` — verified.**
  The components use Svelte 4 idioms (`export let`, `createEventDispatcher`,
  `$:`), which Svelte 5 runs in legacy mode. This was **smoke-tested**, not
  assumed: compiling `GriddleGrid.svelte` and `LoopGrid.svelte` with the Svelte
  **5.56.4** compiler (after TS preprocessing, the way `svelte-package` does)
  succeeded with **no compatibility errors and no deprecation warnings** — the
  only warnings were two pre-existing `a11y_no_static_element_interactions`
  notes that also occur under Svelte 4. `svelte/store` (`writable`/`readable`/
  `derived`, used by `griddleStore.ts`) is also fully present and reactive under
  Svelte 5. So the dual range is an accurate compatibility claim.
  - *Re-run the smoke test as part of the real `svelte-package` build before the
    first publish, to catch anything the isolated compile missed.*
  - **Caveat (future, not a launch blocker):** `createEventDispatcher` is
    deprecated in Svelte 5 and slated for removal in Svelte **6**. The `^5` claim
    is safe today; a future Svelte 6 would break the events. Modernization path
    when needed: migrate component events from `createEventDispatcher` to
    callback props.
  - **Aside:** the two a11y warnings (a `<div>` with a `pointerdown` handler
    needs an ARIA role) are worth fixing for quality but are orthogonal to
    versioning.

---

## 3. Package metadata & npm hygiene (all four packages)

Add/normalize the following fields in each publishable `package.json`:

- `"publishConfig": { "access": "public" }` — **required**; scoped packages
  publish private by default and the first publish will fail otherwise.
- `"repository": { "type": "git", "url": "git+https://github.com/Trustybits/griddle.git", "directory": "packages/<name>" }`
- `"homepage"`, `"bugs"` → point at the GitHub repo.
- `"license": "MIT"` (root `LICENSE` is MIT, © 2026 Trustybits) — add a
  per-package `LICENSE` file (npm shows license per package).
- `"author"` / `"contributors"`.
- `"keywords"` — e.g. `grid`, `canvas`, `drag`, `headless`, `react`, `vue`,
  `svelte`, `layout`, `virtualization`.
- `"sideEffects": false` — enables bundler tree-shaking (verify true; the core
  is pure functions/classes, adapters are components — should be safe).
- `"engines": { "node": ">=18" }` on **all four** packages — **DECISION (made):
  floor is `>=18`.** Verified safe: a grep of `packages/core/src` found **no**
  version-sensitive runtime APIs (no `.at()`, `structuredClone`, `findLast`/
  `toSorted`, `Object.hasOwn`, `Promise.withResolvers`, `globalThis`, `crypto`,
  `Buffer`, `process`, or `fetch`) — the ES2020 core would run well below 18, so
  `>=18` is a conservative, ecosystem-standard floor with margin. (Note:
  advisory only — npm warns but doesn't block unless the consumer sets
  `engine-strict`; separate from browser support, which `target: ES2020`
  governs.)
- Per-package `README.md` — npm renders this on the package page. Each should
  have an install line and a minimal usage snippet (adapt from root `README.md`).

Guard scripts (per package — a broken build can't then be published):

- **core** — `"prepublishOnly": "npm run build && npm test"`. Core is the **only**
  package with a `test` script (`node test/run.mjs`).
- **react / vue / svelte** — `"prepublishOnly": "npm run build"`. The adapters
  have **no** `test` script, so including `npm test` would fail with "Missing
  script: test". (If you want the adapters gated on tests too, point them at the
  core suite from the repo root instead of a local `npm test`.)
- Consider `"prepack"` to guarantee `dist/` exists when packing.

Verification before publish:
- `npm pack --dry-run` in each package and inspect the file list — confirm no
  scratch files, no `src/*.fix`, and that `dist/` + types are present.

---

## 4. Inter-package versioning & the `@griddle/core` dependency

Today every adapter declares `"@griddle/core": "*"` in **both**
`peerDependencies` and `devDependencies`. `*` is fine for local workspace
resolution but is wrong to publish — it would let a consumer pair mismatched
majors.

- **DECISION (made) — core dependency shape: peer dependency, range `^0.1.0`.**
  `@griddle/core` is a **peer dependency** of each adapter with range `^0.1.0`
  (tracking the released version), and stays in `devDependencies` for local
  builds. Rationale: guarantees a **single shared copy** of core when a consumer
  uses both the headless core and an adapter (avoids duplicate `Grid`
  classes/types), and matches the Vue build decision to **externalize** core
  rather than bundle it.
  - **Consumer install experience:** on **npm 7+** (auto-installs peers),
    `npm i @griddle/vue` pulls in `@griddle/core` (and `vue`) automatically.
    **Yarn** (classic + Berry) does **not** auto-install peers, and **pnpm**
    only with config — so yarn/pnpm users may need to add `@griddle/core`
    explicitly. Document this one-liner in each adapter's install instructions.
  - **npm-workspaces caveat:** npm workspaces do **not** rewrite a `workspace:^`
    protocol on publish the way pnpm does, so the published range must be a
    literal semver string. With the manual process below, **bumping the core
    range in each adapter is a manual step every release** (see §5).
- **DECISION (made) — versioning/release process: manual, for now.** Use
  synchronized manual `npm version` + `npm publish` per package (details in §5).
  **Not** adopting Changesets yet — but a future migration is anticipated, so §5
  includes a written runbook for adopting Changesets later.
- **DECISION (made) — starting version: `0.1.0`.** Signals pre-1.0 (breaking
  changes allowed in minors, which suits a still-moving API).
- **DECISION (made) — lockstep versioning.** All four packages share one version
  and bump together, kept in lockstep **manually** for now. This keeps every
  adapter's core range a simple `^<current>` and makes compatibility obvious
  (`@griddle/react@0.1.0` pairs with `@griddle/core@0.1.0`).

---

## 5. Release process — manual (for now)

**DECISION (made):** releases are **manual** for now; Changesets/CI automation is
deferred (runbook below for when we adopt it).

### 5.1 Manual release runbook

Because versions are **lockstep** and npm won't rewrite internal ranges, each
release touches all four packages in a fixed order:

1. Land all changes; ensure `git status` is clean and `master` is up to date.
2. **Bump versions in lockstep** — set the same new `version` in all four
   `package.json` files (core + 3 adapters).
3. **Bump each adapter's `@griddle/core` range** to match — e.g. on a `0.2.0`
   release, set `"@griddle/core": "^0.2.0"` in the `peerDependencies` (and the
   `devDependencies` mirror) of react, vue, and svelte. *(This is the manual step
   npm workspaces won't do for you; don't skip it.)*
4. Verify: `npm run build` (all), `node packages/core/test/run.mjs`,
   `npx vue-tsc --noEmit` in `demos/vue`, and `npm pack --dry-run` per package.
5. **Publish core first**, then the adapters (so the version each adapter's peer
   range points to already exists on npm):
   `npm publish --access public` in `packages/core`, then in each adapter.
6. Tag the release in git (e.g. `v0.2.0`) and push.

> `--access public` is required on the **first** publish of each scoped package
> (or set `"publishConfig": { "access": "public" }` per §3 so it's automatic).

### 5.2 Future: adopting Changesets (deferred — documentation only)

We intend to migrate to **Changesets** later to automate exactly the error-prone
steps above (lockstep bumps + internal `@griddle/core` range rewrites +
changelogs). When we do, add a short `docs/RELEASING.md` (or a section here)
capturing the setup so the switch is turnkey:

- `npm i -D @changesets/cli` and `npx changeset init`.
- Configure **fixed/lockstep** versioning in `.changeset/config.json`:
  `"fixed": [["@griddle/core", "@griddle/react", "@griddle/vue", "@griddle/svelte"]]`.
- Set `"access": "public"` in the Changesets config for scoped packages.
- Workflow: `npx changeset` (declare bumps per change) → `npx changeset version`
  (bumps versions, **rewrites internal ranges**, writes CHANGELOGs) →
  `npx changeset publish`.
- Optional CI: `changesets/action` to open a "Version Packages" release PR, plus
  a publish job using an npm **automation token** (repo secret) or **provenance**
  (`--provenance`, requires GitHub Actions OIDC).

### 5.3 Optional CI gate (independent of release tooling)

Even while releasing manually, a GitHub Actions PR gate is worth adding: on every
PR run `node packages/core/test/run.mjs` + `npm run build` (all packages) +
`npx vue-tsc --noEmit` in `demos/vue` (per `AGENTS.md`).

---

## 6. Open product decisions (verify before publishing a public API)

- **DECISION (made): export `LoopGrid` publicly** from every adapter's
  `index.ts`. It's currently built but unexported (only `GriddleGrid` + the
  hook/store are public). Add it to each barrel:
  - **React** — `LoopGrid.tsx` already exports the component as
    **`GriddleLoopGrid`** and it takes the same `GriddleGridProps`. Re-export it
    (and consider re-exporting under a `LoopGrid` alias for cross-adapter naming
    consistency — **DECISION: settle on one public name**, `GriddleLoopGrid` vs
    `LoopGrid`, and use it across all three adapters).
  - **Vue** — `export { default as LoopGrid } from './LoopGrid.vue'` (default
    export; props via `defineProps`).
  - **Svelte** — `export { default as LoopGrid } from './LoopGrid.svelte'`
    (default export; `api`/`height`/`showGrid` props).
  - **Note (document, don't block):** `GriddleGrid` already **auto-delegates** to
    the loop renderer when `config.loop.enabled` is true, so most users never
    need `LoopGrid` directly. The per-package README should explain when to reach
    for it (e.g. forcing loop rendering explicitly) vs. just setting `loop` in
    config, so the two paths aren't confusing.
- **Docs vs. API drift:** the root `README.md` Quickstart uses
  `<GriddleGrid api={api} renderTile={...} />`, which matches the React
  `GriddleGridProps` (`renderTile` confirmed). Do a final pass to confirm the
  Vue (`#tile` slot) and Svelte usage snippets in per-package READMEs match
  their actual component APIs before publishing.
- Decide whether `docs/loop.md` and `docs/movement.md` should be referenced from
  (or bundled into) the published READMEs, since npm won't include repo-root
  `docs/`.

---

## 7. Execution order — status

1. ✅ **Cleanup:** `git rm`'d the seven tracked scratch files (Section 1a); tree
   clean. Added suffix-based ignores + `**/.svelte-kit/` to `.gitignore`.
2. ✅ **Vue/Svelte build:** added `tsconfig.json` for both, `vite.config.ts`
   (vue) and `svelte.config.js` (svelte); replaced `echo` scripts with
   `vite build && vue-tsc` (vue) and `svelte-package` (svelte); entry points
   repointed to `dist/`. Vue ships `dist`+`src` with maps for parity.
3. ✅ **Metadata:** repository/homepage/bugs/keywords/license/author/sideEffects/
   engines/publishConfig added to all four; per-package `README.md` + `LICENSE`;
   `prepublishOnly` guards (core: build+test, adapters: build).
4. ✅ **Versioning:** each adapter's `@griddle/core` now `^0.1.0` **peer** (mirrored
   in `devDependencies`); all four `version` fields `0.1.0` (lockstep). Manual.
5. ✅ **Verify:** clean `npm run build` (all), `node packages/core/test/run.mjs`
   (50/50), `npx vue-tsc --noEmit` in `demos/vue`, all demos build, and
   `npm pack --dry-run` inspected — tarballs clean.
6. ✅ **Dry run:** `npm publish --dry-run --access public --workspaces` — exit 0,
   4 publishable, 3 demos skipped (private), no errors.
7. ⏳ **First publish (remaining):** manual `npm publish --access public`, core
   first, then the three adapters (so the core version their peer range points to
   exists) — per the §5.1 runbook. Publisher `trustybits` confirmed as `@griddle`
   org owner.
8. ⬜ **Optional (deferred):** CI PR gate (§5.3); Changesets migration (§5.2).

---

## 8. Decisions checklist (for the human)

- [x] **Vue build:** **Decided: Option A** — Vite library mode (compiled JS +
      generated types), `vue` and `@griddle/core` externalized.
- [x] **Ship `src/` in core/react tarballs?** **Decided: yes — ship
      `["dist", "src"]`** so `.js.map`/`.d.ts.map` references stay valid and
      resolve to real `.ts`.
- [x] **Svelte peer range:** **Decided: keep `^4.0.0 || ^5.0.0`** — verified by
      a Svelte 5.56.4 compile smoke test (clean, legacy mode). Re-verify in the
      real `svelte-package` build before first publish.
- [x] **`@griddle/core` dep shape/range** in adapters. **Decided: peer
      dependency, range `^0.1.0`** (also kept in `devDependencies`).
- [x] **Release tooling:** **Decided: manual for now** (§5.1 runbook); Changesets
      deferred with a documented migration path (§5.2).
- [x] **Versioning:** **Decided: lockstep, all four together, manual.**
- [x] **Starting version:** **Decided: `0.1.0`.**
- [x] **`engines.node` floor:** **Decided: `>=18`** on all four packages —
      grep-verified the core uses no APIs newer than that.
- [x] **`LoopGrid`:** **Decided: export publicly** from all three adapter
      barrels (settle on one public name across adapters — see §6).
- [x] **Automation now vs later.** **Decided: all manual for now**; CI/publish
      automation deferred (§5.2 Changesets runbook, §5.3 optional CI gate).
