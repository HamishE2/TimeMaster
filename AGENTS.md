# TimeMaster repository guide

- `index.html` loads `src/main.jsx`, which mounts `src/App.jsx`. App owns workspace state, persistence coordination, and layout. React UI lives in `src/components/`, with styles in `src/index.css` and `src/filePersistence.css`.
- Put domain logic in `src/lib/` and cover it in `tests/run-tests.mjs`. The jsdom App smoke test lives in `tests/App.test.jsx`.
- Vite builds the offline app into `dist/index.html`. Vercel serves `dist/` and `electron/main.cjs` loads the same HTML for the desktop build. The workspace stays local through IndexedDB and optional JSON file attachment.

## Workspace data

- A workspace contains `schemaVersion`, `projects`, and `settings`. Projects have identity and metadata (`id`, `name`, `client`, `code`, `color`, `status`, `isBillable`), scheduling fields (`projectType`, visibility dates, `hiddenWeeks`, `archived`), allocation fields (weekly and monthly resourced hours, overrides, adjustments, and frontloads), and a `tasks` list of `{ id, name }` records.
- `entries[week][day]` stores General hours. `taskEntries[taskId][week][day]` stores phase hours. `taskRows[week]` is the list of pinned task IDs and can include phases with no hours. Week keys are Monday dates in `YYYY-MM-DD` form and day indices run from Monday (0) to Sunday (6).
- `notes[taskId][week][day]` stores a text note for one time entry, with General notes under `general`. Notes are cleared with their hours; use the helpers in `src/lib/entryNotes.js`.
- The General task has the reserved ID `general`. Phase detection also treats a case-insensitive name of `General` as General for older workspaces. Use the phase helpers in `src/lib/tasks.js`.

## Delivery

Run `npm test && npm run lint && npm run build` before opening any PR. Every task ends with its PR merged into `main`.
