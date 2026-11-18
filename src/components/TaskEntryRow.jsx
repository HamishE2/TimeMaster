import { DAY_NAMES, fmt } from '../lib/utils.js';
import EntryFrontloadButton from './EntryFrontloadButton.jsx';

export default function TaskEntryRow({
  project,
  task,
  week,
  days,
  leave,
  suggestion,
  onEntry,
  onSuggestFrontload,
  onRemove,
}) {
  const entries = project.taskEntries?.[task.id]?.[week] || {},
    logged = days.reduce(
      (sum, day) => sum + (leave.includes(day) ? 0 : Number(entries[day] || 0)),
      0,
    );
  return (
    <tr
      className="task-entry-row"
      style={{ '--pc': project.color || 'var(--muted)' }}
    >
      <th>
        <span className="task-indent" title={project.name + ' · ' + task.name}>
          {task.name}
        </span>
      </th>
      {days.map((day) => (
        <td key={day} className={leave.includes(day) ? 'leave' : ''}>
          {leave.includes(day) ? (
            <span className="leave-label">Leave</span>
          ) : (
            <>
              {suggestion?.taskId === task.id && suggestion.day === day && (
                <EntryFrontloadButton
                  project={project}
                  onOpen={onSuggestFrontload}
                  adjustment={suggestion.adjustment}
                />
              )}
              <input
                aria-label={`${project.name}, ${task.name}, ${DAY_NAMES[day]}`}
                key={`${project.id}-${task.id}-${week}-${day}-${entries[day] ?? ''}`}
                defaultValue={entries[day] == null ? '' : fmt(entries[day])}
                onBlur={(event) =>
                  onEntry(project.id, task.id, week, day, event.target.value)
                }
                placeholder="—"
                inputMode="decimal"
              />
            </>
          )}
        </td>
      ))}
      <td>{fmt(logged)}h</td>
      <td>—</td>
      <td>—</td>
      <td className="usage-cell"></td>
      <td>
        <button
          className="task-line-remove"
          onClick={onRemove}
          aria-label={`Remove ${task.name} line`}
        >
          ×
        </button>
      </td>
    </tr>
  );
}
