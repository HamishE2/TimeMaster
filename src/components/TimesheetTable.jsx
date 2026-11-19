import { Fragment } from 'react';
import {
  DAY_NAMES,
  DAY_SHORT,
  EPSILON,
  fmt,
  projectMetrics,
  weekDates,
} from '../lib/utils.js';
import { categoriseProjects } from '../lib/projectGrouping.js';
import {
  frontloadSuggestion,
  frontloadAdjustment,
} from '../lib/frontloading.js';
import ProjectRow from './ProjectRow.jsx';
import TaskEntryRow from './TaskEntryRow.jsx';
import { taskHoursForDay, taskLinesFor } from '../lib/taskLines.js';

export default function TimesheetTable({
  projects,
  allProjects,
  category,
  week,
  days,
  leave,
  leaveWeeks,
  totals,
  onEntry,
  onTaskEntry,
  onAddLine,
  onRemoveTaskLine,
  onLeave,
  onEdit,
  onFrontload,
  onSuggestFrontload,
  onRemove,
  onMove,
}) {
  const dayTotal = (day) =>
      projects.reduce(
        (sum, project) =>
          sum +
          (leave.includes(day)
            ? 0
            : Number(project.entries?.[week]?.[day] || 0) +
              taskHoursForDay(project, week, day)),
        0,
      ),
    dailyTarget =
      totals.planned /
      Math.max(1, days.filter((day) => !leave.includes(day)).length),
    over = totals.remaining < -EPSILON,
    groups = categoriseProjects(projects, category, week, leaveWeeks),
    columnCount = days.length + 5;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Project / task</th>
            {days.map((d) => {
              const date = weekDates(week)[d],
                off = leave.includes(d);
              return (
                <th key={d} className={off ? 'leave' : ''}>
                  <button
                    className="leave-day-toggle"
                    onClick={() => onLeave(d)}
                    aria-pressed={off}
                    aria-label={`${off ? 'Remove' : 'Mark'} ${DAY_NAMES[d]} leave`}
                  >
                    {DAY_SHORT[d]}
                  </button>
                  <b>{date.getDate()}</b>
                </th>
              );
            })}
            <th>Logged</th>
            <th>Plan</th>
            <th>Allowance</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.key}>
              {category !== 'none' && (
                <tr className="timesheet-group-row">
                  <th colSpan={columnCount}>
                    {group.label}
                    <small>
                      {group.projects.length} project
                      {group.projects.length === 1 ? '' : 's'}
                    </small>
                  </th>
                </tr>
              )}
              {group.projects.map((p) => {
                const suggestion =
                    frontloadAdjustment(p, week, leaveWeeks) ||
                    frontloadSuggestion(p, week, leaveWeeks),
                  index = projects.indexOf(p);
                return (
                  <Fragment key={p.id}>
                    <ProjectRow
                      hideClient={category === 'client'}
                      p={p}
                      index={index}
                      count={projects.length}
                      week={week}
                      days={days}
                      leave={leave}
                      leaveWeeks={leaveWeeks}
                      suggestion={suggestion}
                      onEntry={onEntry}
                      onAddLine={() => onAddLine(p)}
                      onEdit={() => onEdit(p)}
                      onFrontload={() => onFrontload(p)}
                      onSuggestFrontload={() =>
                        onSuggestFrontload(p, suggestion)
                      }
                      onRemove={() => onRemove(p)}
                      onMove={onMove}
                    />
                    {taskLinesFor(p, week).map((task) => (
                      <TaskEntryRow
                        key={task.id}
                        project={p}
                        task={task}
                        week={week}
                        days={days}
                        leave={leave}
                        suggestion={suggestion}
                        onEntry={onTaskEntry}
                        onSuggestFrontload={() =>
                          onSuggestFrontload(p, suggestion)
                        }
                        onRemove={() => onRemoveTaskLine(p.id, task.id)}
                      />
                    ))}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>
              {projects.length === allProjects.length
                ? 'Whole week'
                : 'Filtered subtotal'}
              <small>
                {projects.length === allProjects.length
                  ? 'All scheduled work'
                  : `${projects.length} visible projects`}
              </small>
            </th>
            {days.map((day) => {
              const value = dayTotal(day),
                pct = dailyTarget ? Math.round((value / dailyTarget) * 100) : 0;
              return (
                <td key={day} className={pct > 100 ? 'over' : ''}>
                  {fmt(value)}h
                  <small>
                    {leave.includes(day)
                      ? 'Leave'
                      : dailyTarget
                        ? `${pct}% plan`
                        : '—'}
                  </small>
                </td>
              );
            })}
            <td>
              {fmt(
                projects.reduce(
                  (n, p) => n + projectMetrics(p, week, leaveWeeks).logged,
                  0,
                ),
              )}
              h
            </td>
            <td>—</td>
            <td className={over ? 'over' : ''}>
              {over
                ? `${fmt(-totals.remaining)}h over`
                : `${fmt(Math.max(0, totals.remaining))}h free`}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
