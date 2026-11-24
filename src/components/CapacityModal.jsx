import {
  DAY_SHORT,
  EPSILON,
  WEEKLY_RESOURCING_CAPACITY,
  fmt,
  hoursValue,
  isVisible,
  projectMetrics,
  shiftWeek,
  weekDates,
  weekLabel,
  weeklyResourcedHours,
} from '../lib/utils.js';
import { taskHoursForDay } from '../lib/taskLines.js';
import Modal from './Modal.jsx';

const todayIndex = () => (new Date().getDay() + 6) % 7;

export default function CapacityModal({
  projects,
  settings,
  allProjects,
  week,
  leaveWeeks,
  totals,
  onClose,
  onFillCapacity,
}) {
  const rows = projects
    .map((project) => ({
      project,
      metrics: projectMetrics(project, week, leaveWeeks),
    }))
    .filter(({ metrics }) => metrics.plan != null);
  const leave = leaveWeeks[week] || [];
  const dates = weekDates(week);
  const isThisWeek = dates.some(
    (date) => date.toDateString() === new Date().toDateString(),
  );
  const next = shiftWeek(week, 1);
  const nextHours = weeklyResourcedHours(
    allProjects.filter((p) => isVisible(p, next)),
    next,
    leaveWeeks,
  );
  const nextFree = WEEKLY_RESOURCING_CAPACITY - nextHours;
  const unresourced = totals.resourcingCapacity;
  const overAllocated = Math.max(0, totals.resourced - WEEKLY_RESOURCING_CAPACITY);
  const scale = Math.max(WEEKLY_RESOURCING_CAPACITY, totals.resourced);

  return (
    <Modal title="Capacity breakdown" onClose={onClose} wide>
      <div className="capacity-sheet">

        <div className="capacity-bar" role="img" aria-label={`${fmt(totals.resourced)}h of ${fmt(WEEKLY_RESOURCING_CAPACITY)}h resourced`}>
          {rows.map(({ project, metrics }) => (
            <i
              key={project.id}
              style={{
                '--pc': project.color,
                width: `${(Math.max(0, metrics.weeklyAllowance) / scale) * 100}%`,
              }}
              title={`${project.name} · ${fmt(metrics.weeklyAllowance)}h`}
            />
          ))}
          {unresourced > EPSILON && (
            <i className="free" style={{ width: `${(unresourced / scale) * 100}%` }} />
          )}
        </div>

        <table className="capacity-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Original</th>
              <th>Frontloading</th>
              <th>Effective</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map(({ project, metrics }) => {
                const adjustment = metrics.frontloadedIn - metrics.frontloadedOut,
                  shifted = Math.abs(adjustment) > EPSILON;
                return (
                  <tr key={project.id}>
                    <td>
                      <span className="punch" style={{ '--pc': project.color }} />
                      {project.name}
                    </td>
                    <td>{fmt(metrics.plan)}h</td>
                    <td className={shifted ? 'shifted' : 'muted'}>
                      {!shifted
                        ? '—'
                        : `${adjustment > 0 ? '+' : ''}${fmt(adjustment)}h`}
                    </td>
                    <td>{fmt(Math.max(0, metrics.weeklyAllowance))}h</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="4" className="muted">
                  No projects have resourced hours this week.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>Total resourced</td>
              <td colSpan="3">{fmt(totals.resourced)}h</td>
            </tr>
            <tr>
              <td>{overAllocated > EPSILON ? 'Over allocation' : 'Capacity'}</td>
              <td
                colSpan="3"
                className={
                  overAllocated > EPSILON ? 'over' : unresourced > 3 + EPSILON ? 'warn' : ''
                }
              >
                {fmt(overAllocated > EPSILON ? overAllocated : unresourced)}h
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="capacity-summary">
          <div>
            <small>Resourced</small>
            <b>{fmt(totals.resourced)}h</b>
            <small>of {fmt(WEEKLY_RESOURCING_CAPACITY)}h</small>
          </div>
          <div>
            <small>Logged</small>
            <b>{fmt(totals.logged)}h</b>
            <small>of {fmt(totals.capacity)}h working</small>
          </div>
          {overAllocated > EPSILON ? (
            <div className="over">
              <small>Over allocation</small>
              <b>{fmt(overAllocated)}h</b>
            </div>
          ) : (
            <div className={unresourced > 3 + EPSILON ? 'warn' : ''}>
              <small>Unresourced</small>
              <b>{fmt(unresourced)}h</b>
            </div>
          )}
        </div>

        <section className="capacity-section">
          <header>
            <h3>Working days</h3>
            <small>
              {leave.length
                ? `${leave.length} day${leave.length === 1 ? '' : 's'} leave`
                : 'No leave'}
            </small>
          </header>
          <table className="capacity-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Capacity</th>
                <th>Logged</th>
                <th>Free</th>
              </tr>
            </thead>
            <tbody>
              {settings.visibleDays.map((day) => {
                const off = leave.includes(day);
                const cap = off
                  ? 0
                  : Math.max(0, hoursValue(settings.capacityByDay?.[day]));
                const used = off
                  ? 0
                  : projects.reduce(
                      (sum, p) =>
                        sum +
                        Number(p.entries?.[week]?.[day] || 0) +
                        taskHoursForDay(p, week, day),
                      0,
                    );
                const today = isThisWeek && day === todayIndex();
                return (
                  <tr
                    key={day}
                    className={[off ? 'is-leave' : '', today ? 'is-today' : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <td>
                      {DAY_SHORT[day]} {dates[day].getDate()}
                      {off && ' · Leave'}
                      {today && ' · Today'}
                    </td>
                    <td>{fmt(cap)}h</td>
                    <td className={used > cap + EPSILON ? 'over' : ''}>
                      {off ? '—' : `${fmt(used)}h`}
                    </td>
                    <td className={used > cap + EPSILON ? 'over' : ''}>
                      {off
                        ? '—'
                        : `${fmt(Math.abs(cap - used))}h${used > cap + EPSILON ? ' over' : ''}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Week</td>
                <td>{fmt(totals.capacity)}h</td>
                <td>{fmt(totals.logged)}h</td>
                <td className={totals.remaining < -EPSILON ? 'over' : ''}>
                  {fmt(Math.abs(totals.remaining))}h{' '}
                  {totals.remaining < -EPSILON ? 'over' : 'free'}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        <section className="capacity-section">
          <header>
            <h3>Next week</h3>
            <small>{weekLabel(next)}</small>
          </header>
          <div className="capacity-outlook">
            <span>
              <b>{fmt(nextHours)}h</b> resourced
            </span>
            <span className={nextFree < -EPSILON ? 'over' : ''}>
              <b>{fmt(Math.abs(nextFree))}h</b>{' '}
              {nextFree < -EPSILON ? 'over capacity' : 'unresourced'}
            </span>
          </div>
        </section>
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>Done</button>
        <button
          className="primary"
          disabled={unresourced <= EPSILON}
          onClick={() => {
            if (onFillCapacity() !== false) onClose();
          }}
        >
          Fill capacity
        </button>
      </div>
    </Modal>
  );
}
