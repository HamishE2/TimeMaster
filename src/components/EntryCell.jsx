import { fmt, parseHours } from '../lib/utils.js';

// One hours box on the desktop timesheet. It stays a plain input so Tab-flow
// is instant; the table's EntryPopover anchors to it on focus for the note.
// Valid hours are committed as numbers so App does not open the note modal
// (the popover already holds the note); errors and blanks pass through raw.
export default function EntryCell({
  projectId,
  taskId,
  week,
  day,
  value,
  note,
  label,
  onCommit,
}) {
  const shown = value == null ? '' : fmt(value);
  return (
    <span className={`entry-cell${note ? ' has-note' : ''}`}>
      <input
        aria-label={label}
        aria-haspopup="dialog"
        aria-keyshortcuts="ArrowDown Alt+N"
        aria-description={note ? `Note: ${note}` : undefined}
        title={note || undefined}
        key={`${projectId}-${taskId ?? 'general'}-${week}-${day}-${value ?? ''}`}
        defaultValue={shown}
        data-entry={`${projectId}|${taskId ?? ''}|${day}`}
        onBlur={(event) => {
          const raw = event.target.value;
          if (raw.trim() === shown) return;
          const parsed = parseHours(raw);
          // Zero clears the cell (and its note), like deleting the number.
          if (parsed.value === 0) {
            event.target.value = '';
            onCommit('');
            return;
          }
          onCommit(
            parsed.error || parsed.value == null ? raw : parsed.value,
          );
        }}
        placeholder="—"
        inputMode="decimal"
        autoComplete="off"
      />
      {note && <i className="entry-note-dot" aria-hidden="true" />}
    </span>
  );
}
