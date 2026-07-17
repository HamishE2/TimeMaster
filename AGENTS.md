# Delivery workflow

After each task, always push the changes in a pull request and merge that pull request into `main`.

## Cursor Cloud specific instructions

TimeMaster is a fully client-side React 19 + Vite app with no backend, database, or external services; all data lives in the browser (IndexedDB + File System Access API). Standard commands are in `package.json` (`dev`, `build`, `test`, `lint`).

- `npm run dev` serves the app at `http://localhost:5173/` (Vite HMR). This is the way to run the app for development.
- `npm test` currently fails on one test (`provided full legacy backup migrates every project`) because it reads `Backups/01. Backup - 8-12 June.json`, which is gitignored and not present in a fresh checkout; the runner aborts at that point. This is an environment/data limitation, not a code bug — all preceding tests pass. Supply that backup file under `Backups/` to run the full suite.
- `npm run build` produces the single-file deliverable `timemaster-redesigned.html` (via `vite-plugin-singlefile`); the "final HTML is bundled and offline" test depends on this built artifact being current.
