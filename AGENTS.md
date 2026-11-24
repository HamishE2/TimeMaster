# TimeMaster repository guide

- `index.html` loads `src/main.jsx`, which mounts `src/App.jsx`. App owns workspace state, persistence coordination, and layout. React UI lives in `src/components/`, with styles in `src/index.css` and `src/filePersistence.css` (the Financials view, budget editor and costing picker use `src/financials.css`).
- Put domain logic in `src/lib/` and cover it in `tests/run-tests.mjs`. The jsdom App smoke test lives in `tests/App.test.jsx`.
- Vite builds the offline app into `dist/index.html`. Vercel serves `dist/` and `electron/main.cjs` loads the same HTML for the desktop build. The workspace stays local through IndexedDB and optional JSON file attachment.

## Workspace data

- A workspace contains `schemaVersion`, `projects`, and `settings`. Projects have identity and metadata (`id`, `name`, `client`, `code`, `color`, `status`, `isBillable`), scheduling fields (`projectType`, visibility dates, `hiddenWeeks`, `archived`), allocation fields (weekly and monthly resourced hours, overrides, adjustments, and frontloads), and a `tasks` list of `{ id, name }` records.
- `entries[week][day]` stores General hours. `taskEntries[taskId][week][day]` stores phase hours. `taskRows[week]` is the list of pinned task IDs and can include phases with no hours. Week keys are Monday dates in `YYYY-MM-DD` form and day indices run from Monday (0) to Sunday (6).
- `notes[taskId][week][day]` stores a text note for one time entry, with General notes under `general`. Notes are cleared with their hours; use the helpers in `src/lib/entryNotes.js`.
- The General task has the reserved ID `general`. Phase detection also treats a case-insensitive name of `General` as General for older workspaces. Use the phase helpers in `src/lib/tasks.js`.
- Financials (all optional; money is AUD ex GST, rounded to cents). `settings.hourlyRate` is the default cost of one logged hour (`null` = costing off). A project may add `hourlyRate` (its own rate, falling back to the workspace one), `budget` (total), `phaseBudgets[taskId]` (buckets for non-General phases; General and phases without a bucket share what is left of the total), and `activities` (costings: `{ id, name, amount, aliases? }`).
- `activityTags[taskId][week][day]` is a manual costing pick for one entry, with General under `general`: an activity ID, `'none'` (the project's General costing bucket), or a split `{ activityId | 'none': hours }` summing to the entry's hours. A pick beats note matching (`src/lib/activityMatch.js`); unpicked, unmatched time goes to General. Tags are cleared with their hours or note, pruned with their phase, and when an activity is deleted, a whole-entry pick of it is dropped (back to note matching) while its share of a split moves to `'none'`; use the helpers in `src/lib/entryNotes.js`.
- `historicalUsage` (optional) records work done before it was logged here: `[{ id, label, asOf, unit: 'hours' | 'money', total, phases: { taskId | 'general': n }, activities: { activityId | 'none': n } }]`. Each breakdown adds up to `total` (the rest sits in General / `'none'`); a removed phase's share moves to General and a deleted activity's share to `'none'`. Hours are costed at the project rate, dollars as given. History counts towards spend, phase buckets, costings and the cumulative spend chart, but not burn, the week's cost or the review queue. It is added in the Money tab's stepped "Add historical usage data" form (`src/components/HistoricalUsageForm.jsx`, styled by the `cfg-*` classes in `src/financials.css`).
- Cost logic lives in `src/lib/budget.js` (pure functions of the workspace, so undo just works). `migrateBackup` calls its `normaliseProjectFinance` and `normaliseFinanceSettings`; fields that were never set stay absent. Leave-day hours are not costed, matching the timesheet totals.

## Delivery

Run `npm test && npm run lint && npm run build` before opening any PR. Every task ends with its PR merged into `main`.
