import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { DAY_NAMES, dayDate, fmt } from '../lib/utils.js';
import { entryActivityTag, entryNote } from '../lib/entryNotes.js';
import { hoursIn } from '../lib/quickEntry.js';

const WIDTH = 300;

// Anchored note popover for the focused hours cell. The cell input stays the
// hours field; this card holds the note, quick-pick hours and the extras slot.
// Keys in the cell: ArrowDown or Alt+N jumps to the note; Tab moves to the
// next cell; Enter saves; Esc reverts. In the note: Enter saves, Shift+Enter
// adds a line, Esc discards, Tab off the end moves to the next cell.
export default function EntryPopover({
  target,
  project,
  taskName,
  week,
  gap,
  rootRef,
  onSaveNote,
  onSetHours,
  onClose,
  onFinish,
  onRestoreTag,
  cancelRef,
  renderNoteExtras,
}) {
  const { projectId, taskId, day } = target;
  const saved = entryNote(project, taskId, week, day),
    hours = hoursIn(project, taskId, week, day);
  const [draft, setDraft] = useState(saved);
  const [pos, setPos] = useState(null);
  const [needsHours, setNeedsHours] = useState(false);
  const side = useRef(null);
  const id = useId();
  const card = useRef(null),
    draftRef = useRef(draft);
  const anchor = () =>
    rootRef.current?.querySelector(
      `input[data-entry="${projectId}|${taskId ?? ''}|${day}"]`,
    );

  // Keep the card pinned to its cell through scrolling and resizing.
  useLayoutEffect(() => {
    let frame = 0;
    const place = () => {
      const cell = anchor()?.closest('td');
      if (!cell) return;
      const r = cell.getBoundingClientRect(),
        // The sticky app bar covers the top of the page; a cell under it or
        // off screen hides the card instead of leaving it floating.
        top = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0,
        hidden =
          r.height > 0 && (r.bottom < top + 4 || r.top > window.innerHeight - 4),
        h = card.current?.offsetHeight || 180,
        room = window.innerHeight - r.bottom,
        // Stay on the current side while it still fits, so the card does not
        // jump when it grows (a fill chip or the "log hours first" line).
        below =
          (side.current === 'below' && room >= h + 8) ||
          room > h + 12 ||
          r.top - top < h + 12,
        left = Math.min(
          Math.max(8, r.left + r.width / 2 - WIDTH / 2),
          window.innerWidth - WIDTH - 8,
        );
      side.current = below ? 'below' : 'above';
      // When neither side has room (a tall card near the bottom of a short
      // window), keep the card on screen and let it scroll inside.
      const room2 = window.innerHeight - top - 16,
        maxHeight = h > room2 ? Math.max(160, room2) : null,
        wanted = below ? r.bottom + 8 : r.top - h - 8,
        clamped = Math.max(
          top + 8,
          Math.min(wanted, window.innerHeight - Math.min(h, room2) - 8),
        );
      setPos({
        hidden,
        left,
        top: clamped,
        maxHeight,
        below,
        arrow: Math.min(WIDTH - 18, Math.max(18, r.left + r.width / 2 - left)),
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    // The card grows (fill chip, warning) after it is placed above a cell.
    const resize =
      typeof ResizeObserver === 'function' && new ResizeObserver(schedule);
    if (resize && card.current) resize.observe(card.current);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      if (resize) resize.disconnect();
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, taskId, day, week]);

  // Tie the cell to this card for assistive tech. The cell re-mounts when its
  // value changes, so this runs after every render.
  useLayoutEffect(() => {
    const cell = anchor();
    cell?.setAttribute('aria-expanded', 'true');
    cell?.setAttribute('aria-controls', id);
    return () => {
      cell?.removeAttribute('aria-expanded');
      cell?.removeAttribute('aria-controls');
    };
  });

  const lastSaved = useRef(saved);
  // Returns false when the note cannot be kept yet (no hours logged).
  const commitNote = () => {
    const text = draftRef.current.trim();
    if (text === lastSaved.current.trim()) return true;
    // A note belongs to logged hours; without hours only clearing is allowed.
    if (text && hoursIn(project, taskId, week, day) == null && !saved)
      return false;
    lastSaved.current = text;
    onSaveNote(projectId, taskId, week, day, text);
    return true;
  };
  const commitRef = useRef(commitNote);
  // Esc cancels everything done in this card: the note draft is dropped and
  // a costing picked here goes back to what it was when the card opened.
  const openingTag = useRef(entryActivityTag(project, taskId, week, day));
  const cancel = () => {
    draftRef.current = lastSaved.current;
    setDraft(lastSaved.current);
    const now = entryActivityTag(project, taskId, week, day);
    if (JSON.stringify(now) !== JSON.stringify(openingTag.current))
      onRestoreTag?.(projectId, taskId, week, day, openingTag.current);
  };
  useLayoutEffect(() => {
    draftRef.current = draft;
    commitRef.current = commitNote;
    if (cancelRef) cancelRef.current = cancel;
  });

  // Leaving both the cell and the card saves the draft and closes.
  useEffect(() => {
    const inside = (node) =>
      card.current?.contains(node) ||
      (node instanceof Element &&
        node.matches?.('input[data-entry]') &&
        rootRef.current?.contains(node));
    const away = (event) => {
      if (inside(event.target)) return;
      commitRef.current();
      onClose();
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('focusin', away);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('focusin', away);
    };
  }, [onClose, rootRef]);
  // Moving to another cell saves this cell's draft.
  useEffect(() => () => commitRef.current(), []);
  // ArrowDown / Alt+N on a cell whose card was closed reopens it on the note.
  useEffect(() => {
    if (!target.focusNote) return;
    const field = card.current?.querySelector('.entry-popover-note');
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, [target.focusNote]);

  const focusCell = () => anchor()?.focus();
  const nextCell = (direction) => {
    const cells = [
        ...(rootRef.current?.querySelectorAll('input[data-entry]') || []),
      ],
      i = cells.indexOf(anchor());
    const next = cells[i + direction];
    if (next) next.focus();
    else onClose();
  };
  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      onFinish();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [
      ...card.current.querySelectorAll(
        'textarea, input, select, button:not([tabindex="-1"]), [tabindex="0"]',
      ),
    ].filter((node) => !node.disabled);
    if (!event.shiftKey && document.activeElement === items.at(-1)) {
      event.preventDefault();
      if (!commitNote()) return setNeedsHours(true);
      nextCell(1);
    } else if (event.shiftKey && document.activeElement === items[0]) {
      event.preventDefault();
      focusCell();
    }
  };
  const date = dayDate(week, day);
  const picks = [0.5, 1, 2, 4, 7.6];
  return (
    <div
      ref={card}
      id={id}
      className={`entry-popover${pos?.below === false ? ' is-above' : ''}`}
      role="dialog"
      hidden={pos?.hidden || undefined}
      aria-label={`Note for ${project.name}, ${taskName}, ${DAY_NAMES[day]}`}
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: WIDTH,
        ...(pos?.maxHeight
          ? { maxHeight: pos.maxHeight, overflowY: 'auto' }
          : {}),
        '--arrow': `${pos?.arrow ?? WIDTH / 2}px`,
        '--pc': project.color || 'var(--muted)',
      }}
      onKeyDown={onKeyDown}
    >
      <div className="entry-popover-head">
        <span>
          <b>{project.name}</b>
          <small>
            {taskName} ·{' '}
            {DAY_NAMES[day]}{' '}
            {date.toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
            })}
          </small>
        </span>
        <output
          className={`entry-popover-hours${hours == null ? ' is-empty' : ''}`}
        >
          {hours == null ? 'No time' : `${fmt(hours)}h`}
        </output>
      </div>
      <div className="entry-popover-picks" aria-label="Quick hours">
        {picks.map((value) => (
          <button
            key={value}
            type="button"
            tabIndex={-1}
            className={hours === value ? 'is-on' : ''}
            onClick={() => onSetHours(value)}
          >
            {fmt(value)}
          </button>
        ))}
        {gap > 0.009 && (
          <button
            type="button"
            tabIndex={-1}
            className="fill-pick"
            title="Top this day up to capacity"
            onClick={() => onSetHours(Math.round(((hours || 0) + gap) * 100) / 100)}
          >
            Fill +{fmt(gap)}
          </button>
        )}
      </div>
      <textarea
        className="entry-popover-note"
        aria-label="Entry note"
        value={draft}
        rows={2}
        maxLength={1000}
        placeholder={
          hours == null && !saved
            ? 'Log hours first, then add a note'
            : 'What did you work on?'
        }
        aria-invalid={needsHours || undefined}
        aria-describedby={needsHours ? `${id}-needs` : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          setNeedsHours(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            // Without hours, keep the draft and say why instead of dropping it.
            if (!commitNote()) return setNeedsHours(true);
            onFinish();
          }
        }}
      />
      {needsHours && (
        <p id={`${id}-needs`} className="entry-popover-needs" role="alert">
          Log hours in the cell first to keep this note.
        </p>
      )}
      {renderNoteExtras && (
        <div className="entry-popover-extras">
          {renderNoteExtras({
            project,
            taskId,
            week,
            day,
            hours,
            note: draft,
            close: onClose,
          })}
        </div>
      )}
      <p className="entry-popover-hint" aria-hidden="true">
        <kbd>↓</kbd> note · <kbd>Enter</kbd> save · <kbd>Esc</kbd> cancel ·{' '}
        <kbd>Tab</kbd> next
      </p>
    </div>
  );
}
