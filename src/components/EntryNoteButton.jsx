// Corner marker on a timesheet cell: filled when the entry has a note, and
// shown on hover for logged entries without one so a note can be added later.
export default function EntryNoteButton({ note, label, onOpen }) {
  return (
    <button
      type="button"
      className={`entry-note${note ? ' has-note' : ''}`}
      onClick={onOpen}
      title={note || 'Add a note'}
      aria-label={
        note ? `Edit note for ${label}: ${note}` : `Add note for ${label}`
      }
    >
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d="M2 2.5h8v5.5H5.2L2.8 10V8H2z" />
      </svg>
    </button>
  );
}
