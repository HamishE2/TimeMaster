# TimeMaster repository guide

- `index.html` loads `src/main.jsx`, which mounts `src/App.jsx`. App owns workspace state, persistence coordination, and layout. React UI lives in `src/components/`, with styles in `src/index.css` and `src/filePersistence.css` (the Financials view and costing picker use `src/financials.css`).
- Setup dialogs (project editor, add a line, CSV import, frontloading, historical usage) are stepped: one question per step with large choice buttons and fields and Back / Next. Build them from `src/components/StepForm.jsx` (`StepDialog`, `StepSection`, `ChoiceGroup`, `BigField`, `RemainderRow`, `ReviewList`, `StepNote`), styled by the `cfg-*` classes in `src/stepForm.css`.
- Put domain logic in `src/lib/` and cover it in `tests/run-tests.mjs`. The jsdom App smoke test lives in `tests/App.test.jsx`.
- Vite builds the offline app into `dist/index.html`. GitHub Pages serves `dist/` (deployed by `.github/workflows/pages.yml` on push to `main`). The workspace stays local through IndexedDB and optional JSON file attachment.

## Workspace data

- A workspace contains `schemaVersion`, `projects`, and `settings`. Projects have identity and metadata (`id`, `name`, `client`, `code`, `color`, `status`, `isBillable`), scheduling fields (`projectType`, visibility dates, `hiddenWeeks`, `archived`), allocation fields (weekly and monthly resourced hours, overrides, adjustments, and frontloads), and a `tasks` list of `{ id, name }` records.
- `entries[week][day]` stores General hours. `taskEntries[taskId][week][day]` stores phase hours. `taskRows[week]` is the list of pinned task IDs and can include phases with no hours. Week keys are Monday dates in `YYYY-MM-DD` form and day indices run from Monday (0) to Sunday (6).
- `notes[taskId][week][day]` stores a text note for one time entry, with General notes under `general`. Notes are cleared with their hours; use the helpers in `src/lib/entryNotes.js`.
- The General task has the reserved ID `general`. Phase detection also treats a case-insensitive name of `General` as General for older workspaces. Use the phase helpers in `src/lib/tasks.js`.
- Financials (all optional; money is AUD ex GST, rounded to cents). `settings.hourlyRate` is the default cost of one logged hour (`null` = costing off). A project may add `hourlyRate` (its own rate, falling back to the workspace one), `budget` (total), `phaseBudgets[taskId]` (buckets for non-General phases; the project editor requires one for every phase once there is a total, and what is left is the General budget; older projects with unbudgeted phases still share the rest with General), and `activities` (costings: `{ id, name, amount, aliases? }`).
- `activityTags[taskId][week][day]` is a manual costing pick for one entry, with General under `general`: an activity ID, `'none'` (the project's General costing bucket), or a split `{ activityId | 'none': hours }` summing to the entry's hours. A pick beats note matching (`src/lib/activityMatch.js`); unpicked, unmatched time goes to General. Tags are cleared with their hours or note, pruned with their phase, and when an activity is deleted, a whole-entry pick of it is dropped (back to note matching) while its share of a split moves to `'none'`; use the helpers in `src/lib/entryNotes.js`.
- `historicalUsage` (optional) records work done before it was logged here: `[{ id, label, asOf, unit: 'hours' | 'money', total, phases: { taskId | 'general': n }, activities: { activityId | 'none': n } }]`. Each breakdown adds up to `total` (the rest sits in General / `'none'`); a removed phase's share moves to General and a deleted activity's share to `'none'`. Hours are costed at the project rate, dollars as given. History counts towards spend, phase buckets, costings and the cumulative spend chart, but not burn, the week's cost or the review queue. It is added in the Money tab's stepped "Add historical usage data" form (`src/components/HistoricalUsageForm.jsx`).
- The Money view ranks costings above phases above the project budget: cards lead with a bar per costing, then phases, and the project budget is one line unless `budgetLow` flags it (what is left won't cover the unspent costings or phase budgets, whichever is larger, it is 75%+ used, or the plan goes over). `attentionItems` feeds the headline tiles and the Needs attention sidebar; no figures are totalled across projects.
- Cost logic lives in `src/lib/budget.js` (pure functions of the workspace, so undo just works). `migrateBackup` calls its `normaliseProjectFinance` and `normaliseFinanceSettings`; fields that were never set stay absent. Leave-day hours are not costed, matching the timesheet totals.

## Design workflow

- The design source of truth is the Claude design canvas **TimeMaster Design**: https://claude.ai/artifact/JsBJ6rN7QJZdx4XSxmK39P
- Its **Current design** page recreates the shipped UI as editable boards (foundations and tokens, Time view desktop and phone, Money view, empty states). The **Proposals** page holds designs awaiting approval.
- Design before code. Any new feature, new screen or visual/UX change to an existing one is drawn on the Proposals page first. Don't write UI code for it until Hamish has approved the proposal on the canvas (an "approved" comment or an explicit approval in chat). Bug fixes that restore the approved design and pure domain logic in `src/lib/` with no UI change don't need a proposal.
- Build to the approved board. If the implementation has to deviate, update the proposal and get it re-approved rather than drifting silently.
- After the PR merges, update the matching boards on the Current design page so the canvas keeps matching what ships, and mark the proposal Built.
- Boards are recreated markup using the tokens in `src/index.css` (not screenshots). Keep colours, type and spacing in step with that file.

## Delivery

Run `npm test && npm run lint && npm run build` before opening any PR. Every task ends with its PR merged into `main`.
