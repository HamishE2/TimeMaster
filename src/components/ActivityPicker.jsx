import { useContext, useId, useRef, useState } from 'react';
import { LevelsContext } from './levelsContext.js';
import {
  GENERAL_BUCKET,
  resolveEntryActivities,
} from '../lib/activityMatch.js';
import { entryActivityTag } from '../lib/entryNotes.js';
import { isGeneralTask } from '../lib/tasks.js';
import {
  commitSplitRows,
  normaliseActivities,
  splitEditorRows,
} from '../lib/budget.js';
import { fmt } from '../lib/utils.js';

// A pick or split by hand is manual; a note match or the General fallback is auto.
const SOURCE_LABEL = { tag: 'manual', auto: 'auto', default: 'auto' };

// The costing of one time entry: a compact chip ("Costing: QRGs · auto ▾")
// that opens a keyboard list of costings, General, "Split across
// activities…" and "Back to automatic". The choice is reported through
// onTag(tag): an activity ID, GENERAL_BUCKET, a split { id: hours }, or null
// to go back to matching the note. Unpicked, unmatched time goes to General.
export default function ActivityPicker({
  project,
  taskId,
  week,
  day,
  note = '',
  hours,
  onTag,
  compact = false,
  hint = true,
  // A grouped review row tags several entries with different hours, so a
  // split (typed against one entry's hours) is not offered there.
  canSplit = true,
}) {
  const levels = useContext(LevelsContext);
  const id = useId(),
    [open, setOpen] = useState(false),
    [filter, setFilter] = useState(''),
    [active, setActive] = useState(0),
    [rows, setRows] = useState(null),
    chip = useRef(null);
  const activities = normaliseActivities(project?.activities);
  const stored =
    taskId == null ||
    isGeneralTask(project?.tasks?.find((task) => task.id === taskId) || { id: taskId, name: '' })
      ? project?.entries?.[week]?.[day]
      : project?.taskEntries?.[taskId]?.[week]?.[day];
  const total = Number(hours ?? stored);
  if (!activities.length || !(total > 0)) return null;

  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const nameOf = (key) =>
    key === GENERAL_BUCKET ? 'General' : byId.get(key)?.name || 'Removed';
  const tag = entryActivityTag(project, taskId, week, day);
  const text = String(note || '').trim();
  const resolved = resolveEntryActivities(text, activities, tag, total);
  const keys = Object.keys(resolved.split);
  const source = SOURCE_LABEL[resolved.source] || 'auto';
  const summary =
    keys.length > 1
      ? `Split ×${keys.length} · ${keys
          .map((key) => `${nameOf(key)} ${fmt(resolved.split[key])}h`)
          .join(' + ')}`
      : nameOf(keys[0] || GENERAL_BUCKET);
  const gentle =
    resolved.source === 'default' &&
    (resolved.status === 'vague' || resolved.status === 'ambiguous');

  // Menu options: suggestions, every costing, General, then the actions.
  const suggested = [
    ...new Set(
      (resolved.parts || [])
        .flatMap((part) => part.candidates || [])
        .sort((a, b) => b.score - a.score)
        .map((candidate) => candidate.activityId)
        .filter((key) => byId.has(key)),
    ),
  ].slice(0, 3);
  const term = filter.trim().toLowerCase();
  const matches = (label) => !term || label.toLowerCase().includes(term);
  const levelHint = (activityId) =>
    levels.find((level) => level.id === byId.get(activityId)?.levelId)?.name;
  const options = [
    ...suggested.map((key) => ({
      key: `s-${key}`,
      group: 'Suggested',
      label: nameOf(key),
      hint: levelHint(key),
      run: () => onTag?.(key),
    })),
    ...activities
      .filter((activity) => !suggested.includes(activity.id))
      .map((activity) => ({
        key: activity.id,
        group: 'Costings',
        label: activity.name,
        hint: levelHint(activity.id),
        run: () => onTag?.(activity.id),
      })),
    {
      key: GENERAL_BUCKET,
      group: 'Costings',
      label: 'General',
      hint: 'project budget',
      run: () => onTag?.(GENERAL_BUCKET),
    },
  ]
    .filter((option) => matches(option.label))
    .concat([
      canSplit && {
        key: 'split',
        group: 'Actions',
        label: 'Split across activities…',
        run: () => setRows(splitEditorRows(resolved, activities, total)),
      },
      ...(tag
        ? [
            {
              key: 'auto',
              group: 'Actions',
              label: 'Back to automatic',
              run: () => onTag?.(null),
            },
          ]
        : []),
    ])
    .filter(Boolean);
  const current =
    typeof tag === 'string' ? tag : keys.length === 1 ? keys[0] : null;
  const close = (refocus = true) => {
    setOpen(false);
    setFilter('');
    setActive(0);
    if (refocus) requestAnimationFrame(() => chip.current?.focus());
  };
  const choose = (option) => {
    close(option.key !== 'split');
    option.run();
  };
  const onMenuKey = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((active + step + options.length) % options.length);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActive(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (options[active]) choose(options[active]);
    } else if (event.key === 'Escape') {
      // Close only the list, not the surrounding popover or dialog.
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  return (
    <div
      className={`costing-picker${compact ? ' is-compact' : ''}${gentle ? ' is-gentle' : ''}`}
    >
      <button
        ref={chip}
        type="button"
        className={`costing-chip source-${source}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="costing-chip-label">Costing</span>
        <span className="costing-chip-name" title={summary}>
          {summary}
        </span>
        <span className="costing-source">{source}</span>
        <span aria-hidden="true" className="costing-caret">
          ▾
        </span>
      </button>
      {gentle && hint && !open && !rows && (
        <p className="costing-hint">
          Went to General — pick a costing?
        </p>
      )}
      {open && (
        <div className="costing-menu">
          <input
            // The list opens from a click or ArrowDown on the chip, so the
            // filter takes focus at once for type-to-filter.
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={options[active] ? `${id}-opt-${active}` : undefined}
            aria-label="Filter costings"
            placeholder="Type to filter…"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setActive(0);
            }}
            onKeyDown={onMenuKey}
            onBlur={(event) => {
              if (!event.currentTarget.parentElement.contains(event.relatedTarget))
                close(false);
            }}
          />
          <ul id={`${id}-list`} role="listbox" aria-label="Costings">
            {options.map((option, index) => (
              <li
                key={option.key}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={index === active}
                className={`${option.group === 'Actions' ? 'is-action' : ''}${
                  option.key === current || option.key === `s-${current}` ? ' is-current' : ''
                }`}
                data-group={
                  index === 0 || options[index - 1].group !== option.group
                    ? option.group
                    : undefined
                }
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                onPointerEnter={() => setActive(index)}
              >
                <span>{option.label}</span>
                {option.hint && <small>{option.hint}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {rows && (
        <SplitEditor
          id={id}
          rows={rows}
          setRows={setRows}
          total={total}
          activities={activities}
          onSave={(split) => {
            onTag?.(split);
            setRows(null);
            requestAnimationFrame(() => chip.current?.focus());
          }}
          onCancel={() => {
            setRows(null);
            requestAnimationFrame(() => chip.current?.focus());
          }}
        />
      )}
    </div>
  );
}

// Split one entry's hours by hand across costings (General included). The
// remainder goes to General; more than the logged hours cannot be saved.
function SplitEditor({ id, rows, setRows, total, activities, onSave, onCancel }) {
  const result = commitSplitRows(rows, total);
  const allocated = rows.reduce(
    (sum, row) => sum + (row.key ? Number(row.hours) || 0 : 0),
    0,
  );
  const update = (index, patch) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <fieldset
      className="activity-split"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <legend>Split {fmt(total)}h across costings</legend>
      <ul className="activity-split-rows">
        {rows.map((row, index) => (
          <li key={index}>
            <select
              aria-label={`Row ${index + 1} costing`}
              value={row.key}
              // The first row takes focus when the editor opens.
              autoFocus={index === 0}
              onChange={(event) => update(index, { key: event.target.value })}
            >
              <option value="">Choose a costing…</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
              <option value={GENERAL_BUCKET}>General</option>
            </select>
            <span className="activity-split-hours">
              <input
                aria-label={`Row ${index + 1} hours`}
                type="number"
                inputMode="decimal"
                min="0"
                max={total}
                step="0.25"
                placeholder="0"
                value={row.hours}
                aria-invalid={result.row === index || undefined}
                onChange={(event) => update(index, { hours: event.target.value })}
              />
              <span aria-hidden="true">h</span>
            </span>
            <button
              type="button"
              className="activity-split-remove"
              aria-label={`Remove row ${index + 1}`}
              disabled={rows.length === 1}
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <p
        className={`activity-split-total${result.error ? ' is-over' : ''}`}
        aria-live="polite"
        id={`${id}-split-status`}
      >
        {result.error ? (
          result.error
        ) : (
          <>
            Allocated <b>{fmt(Math.round(allocated * 100) / 100)}</b> of{' '}
            {fmt(total)}h
            {result.remainder > 0 && (
              <> · {fmt(result.remainder)}h to General</>
            )}
          </>
        )}
      </p>
      <div className="activity-split-actions">
        <button
          type="button"
          onClick={() => setRows([...rows, { key: '', hours: '' }])}
        >
          + Add row
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={!!result.error}
          aria-describedby={`${id}-split-status`}
          onClick={() => !result.error && onSave(result.split)}
        >
          Save split
        </button>
      </div>
    </fieldset>
  );
}
