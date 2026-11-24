import { useEffect, useMemo, useRef, useState } from 'react';
import { parseQuickEntry, resolveQuickEntry } from '../lib/quickEntry.js';
import { weekKeyFor } from '../lib/utils.js';

const EXAMPLES = ['3h training tue', 'fill audit', '=2 build mon-wed', '1:30 discovery "kickoff"'];

// Type-to-log command line. Press "/" anywhere on the timesheet to focus it.
export default function QuickEntryBar({
  projects,
  week,
  days,
  leave,
  capacityByDay,
  onEntry,
  onTaskEntry,
  onSaveNote,
  onUndo,
}) {
  const [text, setText] = useState('');
  const [done, setDone] = useState(null);
  const field = useRef(null);
  const now = new Date();
  const todayIndex = weekKeyFor(now) === week ? (now.getDay() + 6) % 7 : null;
  const result = useMemo(
    () =>
      resolveQuickEntry(parseQuickEntry(text), {
        projects,
        week,
        days,
        leave,
        todayIndex,
        capacityByDay,
      }),
    [text, projects, week, days, leave, todayIndex, capacityByDay],
  );
  useEffect(() => {
    const onKey = (event) => {
      if (
        event.key === '/' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.target.closest?.('input, textarea, select, [contenteditable]') &&
        !document.querySelector('[aria-modal="true"]')
      ) {
        event.preventDefault();
        field.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(null), 6000);
    return () => clearTimeout(timer);
  }, [done]);
  const apply = () => {
    if (!result.ops) return;
    for (const op of result.ops) {
      const value = op.value == null ? '' : op.value;
      if (op.taskId) onTaskEntry(op.projectId, op.taskId, week, op.day, value);
      else onEntry(op.projectId, week, op.day, value);
      if (result.note && op.value != null)
        onSaveNote?.(op.projectId, op.taskId, week, op.day, result.note);
    }
    setDone(result.summary);
    setText('');
  };
  const state = !text.trim()
    ? 'idle'
    : result.error
      ? 'error'
      : 'ready';
  return (
    <div className={`quick-entry is-${state}`}>
      <label className="quick-entry-field">
        <span className="quick-entry-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M13 3 4 14h7l-1 7 9-11h-7z" />
          </svg>
        </span>
        <span className="sr-only">Quick entry</span>
        <input
          ref={field}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              apply();
            } else if (event.key === 'Escape') setText('');
          }}
          placeholder={`Quick entry — try “${EXAMPLES[0]}” or “${EXAMPLES[1]}”`}
          aria-describedby="quick-entry-preview"
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className="quick-entry-kbd" aria-hidden="true">
          /
        </kbd>
      </label>
      <p id="quick-entry-preview" className="quick-entry-preview" aria-live="polite">
        {state === 'ready' && (
          <>
            <span className="quick-entry-arrow" aria-hidden="true">
              ↵
            </span>{' '}
            {result.summary}
            {result.note && <em> · “{result.note}”</em>}
          </>
        )}
        {state === 'error' && result.error}
        {state === 'idle' &&
          (done ? (
            <span className="quick-entry-done">
              Logged {done}{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  onUndo?.();
                  setDone(null);
                }}
              >
                Undo
              </button>
            </span>
          ) : (
            <span className="quick-entry-tips">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    setText(example);
                    field.current?.focus();
                  }}
                >
                  {example}
                </button>
              ))}
            </span>
          ))}
      </p>
    </div>
  );
}
