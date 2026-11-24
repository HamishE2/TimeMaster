import { useLayoutEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { DAY_NAMES, dayDate, fmt } from '../lib/utils.js';

export default function EntryNoteModal({
  project,
  taskName,
  week,
  day,
  hours,
  note,
  onSave,
  onClose,
}) {
  const [text, setText] = useState(note || ''),
    field = useRef(null),
    returnTo = useRef(null);
  // Modal refocuses itself whenever onClose changes, so callers pass a stable one.
  const close = onClose;
  useLayoutEffect(() => {
    // Take focus before paint so fast typing lands in the note.
    field.current?.focus();
    // If the browser still moved focus on (e.g. tabbing to the next cell),
    // remember that spot to return to and pull focus back into the note.
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active !== field.current) {
        if (!active?.closest('.modal')) returnTo.current = active;
        field.current?.focus();
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      const target = returnTo.current;
      if (target?.isConnected && target !== document.body) target.focus();
    };
  }, []);
  const save = () => {
    onSave(text);
    close();
  };
  const date = dayDate(week, day);
  return (
    <Modal title={note ? 'Edit note' : 'Add a note'} onClose={close}>
      <p className="help entry-note-context">
        <b>{project.name}</b> · {taskName} · {DAY_NAMES[day]}{' '}
        {date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        {hours != null && <> · {fmt(hours)}h</>}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <label>
          Note
          <textarea
            ref={field}
            className="entry-note-text"
            aria-label="Entry note"
            value={text}
            rows={4}
            maxLength={1000}
            placeholder="What did you work on?"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                save();
              }
            }}
          />
        </label>
        <small className="help">
          Enter saves · Shift+Enter adds a new line
        </small>
        <div className="modal-actions">
          {note && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                onSave('');
                close();
              }}
            >
              Delete note
            </button>
          )}
          <button type="button" onClick={close}>
            {note ? 'Cancel' : 'Skip'}
          </button>
          <button type="submit" className="primary">
            Save note
          </button>
        </div>
      </form>
    </Modal>
  );
}
