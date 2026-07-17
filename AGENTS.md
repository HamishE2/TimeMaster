# Delivery workflow

After each task, always push the changes in a pull request and merge that pull request into `main`.

## Cursor Cloud specific instructions

TimeMaster is a **client-only** React + Vite single-page app (no backend, no database service). State persists in the browser via IndexedDB (`src/idb.js`); there are no server processes to run. Standard scripts are in `package.json` (`dev`, `build`, `test`, `lint`, `preview`).

Non-obvious caveats:
- **Dev server URL**: Vite's entry is `timemaster-entry.html` (see `vite.config.js`), so there is no `index.html` and the root `/` returns 404. Open the app at `http://localhost:5173/timemaster.html` (or `/timemaster-entry.html`).
- **`npm run build` rewrites a tracked file**: the `final-deliverable` Vite plugin copies the bundled output over `timemaster-redesigned.html`. If you build, expect a git diff on that file only when the bundle actually changes; don't commit incidental rebuild churn.
- **`npm test` has one expected failure in a clean checkout**: the "provided full legacy backup migrates every project" test reads `Backups/01. Backup - 8-12 June.json`, but `Backups/` is gitignored and not committed, so the test fails with `ENOENT`. All other 17 regression tests pass. This is a missing test-fixture limitation, not a code bug.
- `src/StartupModal.jsx` is dead code (imports functions that no longer exist in `backupService.js`) and is not rendered; the live startup path uses IndexedDB + `EmptyState`.
