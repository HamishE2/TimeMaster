import { useState } from 'react';
import {
  formatMoney,
  projectRateOf,
  toCents,
  weekCostRows,
} from '../lib/budget.js';
import { DAY_SHORT, fmt, weekDates } from '../lib/utils.js';

const money = (cents) => formatMoney(cents / 100, { whole: false });

// The selected week laid out like the timesheet, in dollars instead of hours.
export default function FinancialsWeek({
  entries,
  settings,
  week,
  days,
  leave,
  hasRate,
}) {
  const [by, setBy] = useState('phase');
  const dates = weekDates(week, days);
  const blocks = entries.map(({ project, rows }) => {
    const lines =
      by === 'activity' && project.activities?.length
        ? weekCostRows(project, settings, week, { by: 'activity' })
        : rows;
    const dayCents = Object.fromEntries(
      days.map((day) => [
        day,
        lines.reduce((sum, row) => sum + toCents(row.days[day]?.cost || 0), 0),
      ]),
    );
    return {
      project,
      // A project with no rate (and no workspace rate) shows dashes, not $0.
      rated: hasRate && projectRateOf(project, settings) != null,
      lines: lines.filter((row) => row.hours > 0 || Object.keys(row.days).length),
      dayCents,
      totalCents: lines.reduce((sum, row) => sum + toCents(row.cost), 0),
      hours: lines.reduce((sum, row) => sum + row.hours, 0),
    };
  });
  const logged = blocks.filter((block) => block.hours > 0);
  const totalCents = logged.reduce((sum, block) => sum + block.totalCents, 0);
  const cell = (cost, hours, onLeave, rated = hasRate) =>
    hours ? (
      <>
        <span className="fin-cost">{rated ? money(toCents(cost)) : '—'}</span>
        <small>{onLeave ? 'leave' : `${fmt(hours)}h`}</small>
      </>
    ) : (
      <span className="fin-zero" aria-label="Nothing logged">
        ·
      </span>
    );
  return (
    <section className="fin-section" aria-labelledby="fin-week-title">
      <header className="fin-section-head">
        <div>
          <h3 id="fin-week-title">Cost this week</h3>
          <span>Logged hours × rate, by day</span>
        </div>
        <div className="fin-segmented" role="radiogroup" aria-label="Rows">
          {[
            ['phase', 'By phase'],
            ['activity', 'By activity'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={by === value}
              onClick={() => setBy(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      {logged.length === 0 ? (
        <div className="fin-empty is-inline">
          <span className="fin-empty-glyph" aria-hidden="true">0</span>
          <div>
            <h3>Nothing logged this week</h3>
            <p>
              Costs appear here as you log time on the Timesheet. Use the week
              arrows to look at another week.
            </p>
          </div>
        </div>
      ) : (
        <div className="fin-table-scroll">
          <table className="fin-week">
            <thead>
              <tr>
                <th scope="col">Project</th>
                {dates.map(({ dayIndex, date }) => (
                  <th
                    scope="col"
                    key={dayIndex}
                    className={leave.includes(dayIndex) ? 'is-leave' : ''}
                  >
                    {DAY_SHORT[dayIndex]} <b>{date.getDate()}</b>
                    {leave.includes(dayIndex) && <small>Leave</small>}
                  </th>
                ))}
                <th scope="col">Total</th>
              </tr>
            </thead>
            {logged.map((block) => (
              <tbody key={block.project.id}>
                <tr className="fin-project-row">
                  <th scope="rowgroup">
                    <i
                      className="project-ring"
                      style={{ color: block.project.color }}
                      aria-hidden="true"
                    />
                    {block.project.name}
                  </th>
                  {days.map((day) => (
                    <td key={day}>
                      {block.rated
                        ? block.dayCents[day]
                          ? money(block.dayCents[day])
                          : ''
                        : block.lines.some((row) => row.days[day]?.hours)
                          ? '—'
                          : ''}
                    </td>
                  ))}
                  <td className="fin-total">
                    {block.rated ? money(block.totalCents) : '—'}
                  </td>
                </tr>
                {block.lines.map((row) => (
                  <tr key={row.id} className={row.id === '__unlinked' ? 'is-unlinked' : ''}>
                    <th scope="row" className="fin-line">
                      {row.name || 'Activity'}
                    </th>
                    {days.map((day) => (
                      <td key={day}>
                        {cell(
                          row.days[day]?.cost,
                          row.days[day]?.hours,
                          row.days[day]?.onLeave,
                          block.rated,
                        )}
                      </td>
                    ))}
                    <td className="fin-total">
                      {cell(row.cost, row.hours, false, block.rated)}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tfoot>
              <tr>
                <th scope="row">Week total</th>
                {days.map((day) => (
                  <td key={day}>
                    {hasRate
                      ? money(
                          logged.reduce(
                            (sum, block) => sum + (block.dayCents[day] || 0),
                            0,
                          ),
                        )
                      : '—'}
                  </td>
                ))}
                <td className="fin-total">
                  {hasRate ? money(totalCents) : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
