import { DAY_NAMES, DAY_SHORT, fmt } from '../lib/utils.js';
import { categoriseProjects } from '../lib/projectGrouping.js';
import { hasPhases } from '../lib/tasks.js';
import { projectSummary } from '../lib/projectSummary.js';
import FrontloadButton from './FrontloadButton.jsx';
import FrontloadWarning from './FrontloadWarning.jsx';
import ProjectAllocationBars from './ProjectAllocationBars.jsx';
import { taskLinesFor } from '../lib/taskLines.js';

export default function MobileCards({
  projects,
  category,
  week,
  days,
  leave,
  leaveWeeks,
  onEntry,
  onTaskEntry,
  onAddLine,
  onRemoveTaskLine,
  onEdit,
  onFrontload,
}) {
  const groups = categoriseProjects(projects, category, week, leaveWeeks);
  return (
    <div className="mobile-cards">
      {groups.map((group) => (
        <section className="mobile-category" key={group.key}>
          {category !== 'none' && (
            <h3>
              {group.label}
              <span>{group.projects.length}</span>
            </h3>
          )}
          {group.projects.map((p) => {
            const {
              metrics: m,
              status,
              statusLabel,
              remainingLabel,
              sourceNote,
              sourceNoteTitle,
            } = projectSummary(p, week, leaveWeeks);
            const taskLines = taskLinesFor(p, week),
              hasTasks = hasPhases(p);
            return (
              <article key={p.id}>
                {p.client && category !== 'client' && (
                  <div className="project-client">{p.client}</div>
                )}
                <header>
                  <div className="mobile-project-title">
                    <button onClick={() => onEdit(p)}>{p.name}</button>
                    <FrontloadWarning metrics={m} />
                    <FrontloadButton
                      project={p}
                      week={week}
                      onOpen={() => onFrontload(p)}
                    />
                  </div>
                  <span className={m.status}>{remainingLabel}</span>
                </header>
                {(status !== 'active' || p.isBillable === false) && (
                  <div className="mobile-project-meta">
                    {status !== 'active' && (
                      <span className={`project-status-badge status-${status}`}>
                        {statusLabel}
                      </span>
                    )}
                    {p.isBillable === false && (
                      <span className="billability-badge">Non-billable</span>
                    )}
                  </div>
                )}
                <ProjectAllocationBars
                  project={p}
                  week={week}
                  leaveWeeks={leaveWeeks}
                  metrics={m}
                  className="mobile-allocation-bars"
                />
                {!hasTasks && (
                  <div>
                    {days.map((d) => (
                      <label key={d}>
                        {DAY_SHORT[d]}
                        <input
                          aria-label={`${p.name}, General, ${DAY_NAMES[d]}`}
                          disabled={leave.includes(d)}
                          key={`${p.id}-mobile-${week}-${d}-${p.entries?.[week]?.[d] ?? ''}`}
                          defaultValue={
                            p.entries?.[week]?.[d] == null
                              ? ''
                              : fmt(p.entries[week][d])
                          }
                          onBlur={(e) => onEntry(p.id, week, d, e.target.value)}
                          placeholder={leave.includes(d) ? 'Leave' : '—'}
                        />
                      </label>
                    ))}
                  </div>
                )}
                {taskLines.map((task) => (
                  <section className="mobile-task-block" key={task.id}>
                    <strong>
                      {task.name}
                      <button
                        onClick={() => onRemoveTaskLine(p.id, task.id)}
                        aria-label={`Remove ${task.name} line`}
                      >
                        ×
                      </button>
                    </strong>
                    <div>
                      {days.map((day) => {
                        const value = p.taskEntries?.[task.id]?.[week]?.[day];
                        return (
                          <label key={day}>
                            {DAY_SHORT[day]}
                            <input
                              aria-label={`${p.name}, ${task.name}, ${DAY_NAMES[day]}`}
                              disabled={leave.includes(day)}
                              key={`${p.id}-${task.id}-mobile-${week}-${day}-${value ?? ''}`}
                              defaultValue={value == null ? '' : fmt(value)}
                              onBlur={(event) =>
                                onTaskEntry(
                                  p.id,
                                  task.id,
                                  week,
                                  day,
                                  event.target.value,
                                )
                              }
                              placeholder={leave.includes(day) ? 'Leave' : '—'}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </section>
                ))}
                <footer>
                  {fmt(m.logged)}h logged ·{' '}
                  {m.plan == null
                    ? 'Unlimited plan'
                    : `${fmt(m.plan)}h planned`}
                  {sourceNote && (
                    <span
                      className="frontload-source-note"
                      title={sourceNoteTitle}
                    >
                      {` · ${sourceNote}`}
                    </span>
                  )}
                  {hasTasks && (
                    <button
                      className="mobile-add-line"
                      onClick={() => onAddLine(p)}
                    >
                      Add task line
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
