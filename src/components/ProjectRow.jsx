import { DAY_NAMES, EPSILON, fmt } from '../lib/utils.js';
import { hasPhases } from '../lib/tasks.js';
import { projectSummary } from '../lib/projectSummary.js';
import EntryFrontloadButton from './EntryFrontloadButton.jsx';
import EntryCell from './EntryCell.jsx';
import { entryNote } from '../lib/entryNotes.js';
import FrontloadButton from './FrontloadButton.jsx';
import FrontloadWarning from './FrontloadWarning.jsx';
import { taskLinesFor } from '../lib/taskLines.js';
import UsageBar from './UsageBar.jsx';

export default function ProjectRow({
  p,
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
  grip,
  dragging,
  overDays,
  onMenu,
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
      data-project={p.id}
      data-row={`p:${p.id}`}
      className={`project-start${hasTasks ? ' project-header-row' : ''}${dragging ? ' is-dragging' : ''}`}
      style={{ '--pc': p.color || 'var(--muted)' }}
      onContextMenu={onMenu}
    >
      {hasTasks ? (
        <th colSpan={days.length + 1} className="project-header-cell">
          <div className="header-line">
            {grip}
            <span className="header-id">
              {((p.client && !hideClient) || p.code) && (
                <span className="project-client">
                  {[!hideClient && p.client, p.code]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
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
            <UsageBar metrics={m} />
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
          {grip}
          <div className="header-id">
            {((p.client && !hideClient) || p.code) && (
              <span className="project-client">
                {[!hideClient && p.client, p.code].filter(Boolean).join(' · ')}
              </span>
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
            <td
              key={d}
              className={
                leave.includes(d)
                  ? 'leave'
                  : overDays?.has(d) && p.entries?.[week]?.[d] > 0
                    ? 'entry-over'
                    : ''
              }
            >
              {leave.includes(d) ? (
                <span className="leave-label">Leave</span>
              ) : (
                <>
                  {suggestion &&
                    suggestion.taskId == null &&
                    suggestion.day === d && (
                      <EntryFrontloadButton
                        amount={suggestion.amount}
                        project={p}
                        onOpen={onSuggestFrontload}
                        adjustment={suggestion.adjustment}
                      />
                    )}
                  <EntryCell
                    projectId={p.id}
                    taskId={null}
                    week={week}
                    day={d}
                    value={p.entries?.[week]?.[d]}
                    note={entryNote(p, null, week, d)}
                    label={`${p.name}, General, ${DAY_NAMES[d]}`}
                    onCommit={(value) => onEntry(p.id, week, d, value)}
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
        {m.effective > 0 && m.remaining > EPSILON && (
          <small>{Math.round((m.remaining / m.effective) * 100)}% left</small>
        )}
      </td>
      <td className="row-menu-cell">
        <button
          type="button"
          className="row-menu-button"
          onClick={onMenu}
          aria-haspopup="menu"
          aria-label={`Options for ${p.name}`}
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
