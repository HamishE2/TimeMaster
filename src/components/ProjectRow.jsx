import { DAY_NAMES, EPSILON, fmt } from '../lib/utils.js';
import { hasPhases } from '../lib/tasks.js';
import { projectSummary } from '../lib/projectSummary.js';
import EntryFrontloadButton from './EntryFrontloadButton.jsx';
import FrontloadButton from './FrontloadButton.jsx';
import FrontloadWarning from './FrontloadWarning.jsx';
import { taskLinesFor } from '../lib/taskLines.js';

export default function ProjectRow({
  p,
  index,
  count,
  week,
  days,
  leave,
  leaveWeeks,
  hideClient,
  suggestion,
  onEntry,
  onAddLine,
  onEdit,
  onFrontload,
  onSuggestFrontload,
  onRemove,
  onMove,
}) {
  const {
    metrics: m,
    status,
    statusLabel,
    remainingLabel,
    sourceNote,
    sourceNoteTitle,
  } = projectSummary(p, week, leaveWeeks);
  const hasTasks = hasPhases(p),
    hasLines = taskLinesFor(p, week).length > 0,
    incomingNote =
      m.frontloadedIn > EPSILON
        ? `+${fmt(m.frontloadedIn)}h due to frontloading from next week`
        : null;
  return (
    <tr
      className={`project-start${hasTasks ? ' project-header-row' : ''}`}
      style={{ '--pc': p.color || 'var(--muted)' }}
    >
      {hasTasks ? (
        <th colSpan={days.length + 1} className="project-header-cell">
          <div className="header-line">
            <span className="header-id">
              {p.client && !hideClient && (
                <span className="project-client">{p.client}</span>
              )}
              <span className="table-project-title">
                <i style={{ background: p.color || 'var(--muted)' }} />
                <button
                  className="project-name"
                  onClick={onEdit}
                  title={p.code ? `${p.name} · ${p.code}` : p.name}
                >
                  {p.name}
                </button>
                <FrontloadWarning metrics={m} />
                <FrontloadButton project={p} week={week} onOpen={onFrontload} />
              </span>
            </span>
            <span className="row-chips">
              {status !== 'active' && (
                <span className={`project-status-badge status-${status}`}>
                  {statusLabel}
                </span>
              )}
              {p.isBillable === false && (
                <span className="billability-badge">Non-billable</span>
              )}
              {hasTasks && !hasLines && (
                <button className="inline-add-line" onClick={onAddLine}>
                  add a task line
                </button>
              )}
            </span>
          </div>
        </th>
      ) : (
        <th>
          <div className="header-id">
            {p.client && !hideClient && (
              <span className="project-client">{p.client}</span>
            )}
            <span className="table-project-title">
              <i style={{ background: p.color || 'var(--muted)' }} />
              <button
                className="project-name"
                onClick={onEdit}
                title={p.code ? `${p.name} · ${p.code}` : p.name}
              >
                {p.name}
              </button>
              <FrontloadWarning metrics={m} />
              <FrontloadButton project={p} week={week} onOpen={onFrontload} />
            </span>
            <span className="row-chips">
              {status !== 'active' && (
                <span className={`project-status-badge status-${status}`}>
                  {statusLabel}
                </span>
              )}
              {p.isBillable === false && (
                <span className="billability-badge">Non-billable</span>
              )}
            </span>
          </div>
        </th>
      )}
      {hasTasks
        ? null
        : days.map((d) => (
            <td key={d} className={leave.includes(d) ? 'leave' : ''}>
              {leave.includes(d) ? (
                <span className="leave-label">Leave</span>
              ) : (
                <>
                  {suggestion &&
                    suggestion.taskId == null &&
                    suggestion.day === d && (
                      <EntryFrontloadButton
                        project={p}
                        onOpen={onSuggestFrontload}
                        adjustment={suggestion.adjustment}
                      />
                    )}
                  <input
                    aria-label={`${p.name}, General, ${DAY_NAMES[d]}`}
                    key={`${p.id}-${week}-${d}-${p.entries?.[week]?.[d] ?? ''}`}
                    defaultValue={
                      p.entries?.[week]?.[d] == null
                        ? ''
                        : fmt(p.entries[week][d])
                    }
                    onBlur={(e) => onEntry(p.id, week, d, e.target.value)}
                    placeholder="—"
                    inputMode="decimal"
                  />
                </>
              )}
            </td>
          ))}
      <td>{fmt(m.logged)}h</td>
      <td
        className={sourceNote || incomingNote ? 'frontload-reduced-limit' : ''}
      >
        {m.plan == null ? 'Unlimited' : `${fmt(m.plan)}h`}
        {sourceNote && (
          <small className="frontload-source-note" title={sourceNoteTitle}>
            {sourceNote}
          </small>
        )}
        {incomingNote && (
          <small
            className="frontload-source-note"
            title={`Weekly capacity includes ${fmt(m.frontloadedIn)} hours frontloaded from next week`}
          >
            {incomingNote}
          </small>
        )}
      </td>
      <td className={m.status}>
        {remainingLabel}
        {m.effective > 0 && m.remaining > 0 && (
          <small>{Math.round((m.remaining / m.effective) * 100)}% left</small>
        )}
      </td>
      <td>
        <div className="row-actions">
          {hasTasks && (
            <button
              onClick={onAddLine}
              aria-label={`Add task line for ${p.name}`}
            >
              ＋
            </button>
          )}
          <button
            onClick={() => onMove(p.id, -1)}
            disabled={index === 0}
            aria-label={`Move ${p.name} up`}
          >
            ↑
          </button>
          <button
            onClick={() => onMove(p.id, 1)}
            disabled={index === count - 1}
            aria-label={`Move ${p.name} down`}
          >
            ↓
          </button>
          <button
            className="row-options"
            onClick={onEdit}
            aria-label={`Options for ${p.name}`}
            title="Project options"
          >
            ✎
          </button>
          <button
            className="row-delete"
            onClick={onRemove}
            aria-label={`Delete ${p.name}`}
            title="Delete project"
          >
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}
