import { Fragment, useState } from 'react';
import { DAY_NAMES, fmt, weekDates } from '../lib/utils.js';
import { taskHoursForDay, taskLinesFor } from '../lib/taskLines.js';
import { hasPhases } from '../lib/tasks.js';

export default function MobileDays({
  projects,
  week,
  days,
  leave,
  onEntry,
  onTaskEntry,
}) {
  const [selected,setSelected]=useState((new Date().getDay()+6)%7);
  const current=days.includes(selected)?selected:days[0];
  const dates = weekDates(week);
  return (
    <div className="mobile-days">
      <nav aria-label="Timesheet day">{days.map(d=><button key={d} aria-pressed={d===current} onClick={()=>setSelected(d)}>{DAY_NAMES[d].slice(0,3)} {dates[d].getDate()}</button>)}</nav>
      {[current].map((day) => {
        const isLeave = leave.includes(day),
          total = projects.reduce(
            (sum, project) =>
              sum +
              (isLeave
                ? 0
                : Number(project.entries?.[week]?.[day] || 0) +
                  taskHoursForDay(project, week, day)),
            0,
          );
        return (
          <article key={day}>
            <header>
              <div>
                <strong>{DAY_NAMES[day]}</strong>
                <span>
                  {dates[day].toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </div>
              <b className={isLeave ? 'leave-day-total' : ''}>
                {isLeave ? 'Leave' : `${fmt(total)}h logged`}
              </b>
            </header>
            <div className="mobile-day-projects">
              {projects.map((project) => (
                <Fragment key={project.id}>
                  {hasPhases(project) && (
                    <strong className="mobile-line-label">
                      {project.name}
                    </strong>
                  )}
                  {!hasPhases(project) && (
                    <label>
                      <span>
                        {project.client && (
                          <small className="day-client">{project.client}</small>
                        )}
                        {project.name}
                      </span>
                      <input
                        aria-label={`${DAY_NAMES[day]}, ${project.name}, General`}
                        disabled={isLeave}
                        key={`${project.id}-day-${week}-${day}-${project.entries?.[week]?.[day] ?? ''}`}
                        defaultValue={
                          project.entries?.[week]?.[day] == null
                            ? ''
                            : fmt(project.entries[week][day])
                        }
                        onBlur={(event) =>
                          onEntry(project.id, week, day, event.target.value)
                        }
                        placeholder={isLeave ? 'Leave' : '—'}
                      />
                    </label>
                  )}
                  {taskLinesFor(project, week).map((task) => {
                    const value = project.taskEntries?.[task.id]?.[week]?.[day];
                    return (
                      <label className="mobile-task-line" key={task.id}>
                        <span>{task.name}</span>
                        <input
                          aria-label={`${DAY_NAMES[day]}, ${project.name}, ${task.name}`}
                          disabled={isLeave}
                          key={`${project.id}-${task.id}-day-${week}-${day}-${value ?? ''}`}
                          defaultValue={value == null ? '' : fmt(value)}
                          onBlur={(event) =>
                            onTaskEntry(
                              project.id,
                              task.id,
                              week,
                              day,
                              event.target.value,
                            )
                          }
                          placeholder={isLeave ? 'Leave' : '—'}
                        />
                      </label>
                    );
                  })}
                </Fragment>
              ))}
            </div>
            {projects.length === 0 && (
              <p className="quiet">No projects match the current filters.</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
