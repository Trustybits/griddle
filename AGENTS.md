# Agent guidelines for griddle

## Scratch files and command output

- Never write scratch output (build logs, test output redirects, probe files,
  `.tmp`/`.bak`/`.head`/`.fix` copies of source files) into tracked directories.
- If you need to redirect command output to a file (e.g. flaky terminal, ANSI
  output issues), write it to `.agent/` at the repo root — it is gitignored.
  Example: `cmd /c "npm run build > ../../.agent/build-core.txt 2>&1"`
- Before finishing a task, verify `git status --porcelain` shows only files you
  intentionally changed. Delete anything else you created.

## Verification

- Core: `node test/run.mjs` in `packages/core` (pure Node, no test framework).
- Packages: `npm run build` in each `packages/*` (core and react run `tsc`;
  vue and svelte ship source and have no compile step).
- Demos: `npm run build` in each `demos/*`; `npx vue-tsc --noEmit` in
  `demos/vue` for template type-checking.

## Project constraints

- `@griddle/core` must stay dependency-free; adapters may depend only on their
  framework as a peer dependency.
- Demo tsconfigs intentionally exclude `vite.config.ts` — `@types/node` is not
  installed anywhere in this repo. Don't re-add it to `include`.
