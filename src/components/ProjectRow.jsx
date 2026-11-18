import { DAY_NAMES, EPSILON, fmt, projectMetrics } from '../lib/utils.js';
import { projectStatus, projectStatusLabel } from '../lib/projectGrouping.js';
import EntryFrontloadButton from './EntryFrontloadButton.jsx';
import FrontloadButton from './FrontloadButton.jsx';
import FrontloadWarning from './FrontloadWarning.jsx';
import ProjectAllocationBars from './ProjectAllocationBars.jsx';
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
  const m = projectMetrics(p, week, leaveWeeks),
    hasTasks = (p.tasks || []).some(
      (task) => task.id !== 'general' && task.name.toLowerCase() !== 'general',
    ),
    hasLines = taskLinesFor(p, week).length > 0,
    sourceNote =
      m.frontloadedOut > EPSILON
        ? `−${fmt(m.frontloadedOut)}h frontloaded to previous week`
        : null,
    incomingNote =
      m.frontloadedIn > EPSILON
        ? `+${fmt(m.frontloadedIn)}h due to frontloading from next week`
        : null,
    over = m.remaining != null && m.remaining < -EPSILON,
    status = projectStatus(p.status);
  return (
    <tr
      className={`project-start${hasTasks ? ' project-header-row' : ''}`}
      style={{ '--pc': p.color || 'var(--muted)' }}
    >
      {hasTasks ? (
        <th colSpan={days.length + 2} className="project-header-cell">
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
                  {projectStatusLabel(status)}
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
            <ProjectAllocationBars
              project={p}
              week={week}
              leaveWeeks={leaveWeeks}
              className="timesheet-allocation-bars is-inline hdr-inline"
            />
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
                  {projectStatusLabel(status)}
                </span>
              )}
              {p.isBillable === false && (
                <span className="billability-badge">Non-billable</span>
              )}
            </span>
          </div>
          <ProjectAllocationBars
            project={p}
            week={week}
            leaveWeeks={leaveWeeks}
            className="timesheet-allocation-bars is-edge"
          />
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
      {!hasTasks && <td>{fmt(m.logged)}h</td>}
      <td
        className={sourceNote || incomingNote ? 'frontload-reduced-limit' : ''}
      >
        {m.plan == null ? 'Unlimited' : `${fmt(m.plan)}h`}
        {sourceNote && (
          <small
            className="frontload-source-note"
            title={`Weekly limit reduced by ${fmt(m.frontloadedOut)} hours due to frontloading in the previous week`}
          >
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
        {m.remaining == null
          ? 'Unlimited'
          : over
            ? `${fmt(-m.remaining)}h over`
            : Math.abs(m.remaining) <= EPSILON
              ? 'At plan'
              : `${fmt(Math.max(0, m.remaining))}h left`}
      </td>
      <td className="usage-cell">
        <ProjectAllocationBars
          project={p}
          week={week}
          leaveWeeks={leaveWeeks}
          className="timesheet-allocation-bars is-inline is-usage"
        />
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
