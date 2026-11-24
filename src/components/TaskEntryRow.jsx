import { DAY_NAMES, fmt } from '../lib/utils.js';
import EntryFrontloadButton from './EntryFrontloadButton.jsx';
import EntryCell from './EntryCell.jsx';
import { entryNote } from '../lib/entryNotes.js';

export default function TaskEntryRow({
  project,
  task,
  week,
  days,
  leave,
  suggestion,
  onEntry,
  onSuggestFrontload,
  dragging,
  overDays,
  grip,
  onMenu,
}) {
  const entries = project.taskEntries?.[task.id]?.[week] || {},
    logged = days.reduce(
      (sum, day) => sum + (leave.includes(day) ? 0 : Number(entries[day] || 0)),
      0,
    );
  return (
    <tr
      data-project={project.id}
      data-row={`t:${project.id}:${task.id}`}
      className={`task-entry-row${dragging ? ' is-dragging' : ''}`}
      style={{ '--pc': project.color || 'var(--muted)' }}
      onContextMenu={onMenu}
    >
      <th>
        {grip}
        <span className="task-indent" title={project.name + ' · ' + task.name}>
          {task.name}
        </span>
      </th>
      {days.map((day) => (
        <td
          key={day}
          className={
            leave.includes(day)
              ? 'leave'
              : overDays?.has(day) && entries[day] > 0
                ? 'entry-over'
                : ''
          }
        >
          {leave.includes(day) ? (
            <span className="leave-label">Leave</span>
          ) : (
            <>
              {suggestion?.taskId === task.id && suggestion.day === day && (
                <EntryFrontloadButton
                  amount={suggestion.amount}
                  project={project}
                  onOpen={onSuggestFrontload}
                  adjustment={suggestion.adjustment}
                />
              )}
              <EntryCell
                projectId={project.id}
                taskId={task.id}
                week={week}
                day={day}
                value={entries[day]}
                note={entryNote(project, task.id, week, day)}
                label={`${project.name}, ${task.name}, ${DAY_NAMES[day]}`}
                onCommit={(value) =>
                  onEntry(project.id, task.id, week, day, value)
                }
              />
            </>
          )}
        </td>
      ))}
      <td>{fmt(logged)}h</td>
      <td>—</td>
      <td>—</td>
      <td className="row-menu-cell">
        <button
          type="button"
          className="row-menu-button"
          onClick={onMenu}
          aria-haspopup="menu"
          aria-label={`Options for ${task.name} line`}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="3" cy="8" r="1.4" />
            <circle cx="8" cy="8" r="1.4" />
            <circle cx="13" cy="8" r="1.4" />
          </svg>
        </button>
      </td>
    </tr>
  );
}
