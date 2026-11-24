import {
  ACTIVITY_NEAR,
  formatEffort,
  formatMoney,
  formatPercent,
} from '../lib/budget.js';
import { fmt } from '../lib/utils.js';
import { BudgetMeter, StatusChip } from './FinancialsParts.jsx';

const SOURCES = [
  ['picked', 'picked', 'Chosen by hand'],
  ['auto', 'auto', 'Matched from the note'],
  ['default', 'default', 'Went to General by default'],
];

// How the hours of a costing were assigned: by hand, by inference, by default.
function SourceBadges({ bySource }) {
  const shown = SOURCES.filter(([key]) => bySource?.[key] > 0);
  if (!shown.length) return null;
  return (
    <span className="costing-sources">
      {shown.map(([key, label, title]) => (
        <span key={key} className={`costing-source source-${key}`} title={title}>
          {label} {fmt(bySource[key])}h
        </span>
      ))}
    </span>
  );
}

function CostingRow({ row, item, perDay, isGeneral = false }) {
  return (
    <tr className={isGeneral ? 'is-general' : ''}>
      <th scope="row" className="fin-line">
        {row.name}
        {isGeneral && <small>Budget left after the costings</small>}
        <small>
          {fmt(Math.round(row.hours * 100) / 100)}h · {row.entries}{' '}
          {row.entries === 1 ? 'entry' : 'entries'}
        </small>
        <SourceBadges bySource={row.bySource} />
      </th>
      <td className="fin-num">
        {row.amount == null ? '—' : formatMoney(row.amount, { whole: true })}
        {row.amount != null && item.hasRate && (
          <small>{formatEffort(row.amount, item.rate, perDay)}</small>
        )}
      </td>
      <td className="fin-num">{item.hasRate ? formatMoney(row.spent) : '—'}</td>
      <td>
        {item.hasRate && row.variance != null ? (
          <span
            className={`fin-variance ${row.variance < 0 ? 'is-over' : 'is-under'}`}
          >
            {row.variance < 0
              ? `${formatMoney(-row.variance, { whole: true })} over`
              : `${formatMoney(row.variance, { whole: true })} left`}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="fin-bar-col">
        {item.hasRate && row.amount != null ? (
          <span className="fin-bar-cell">
            <BudgetMeter
              spent={row.spent}
              budget={row.amount}
              tone={row.status.tone}
              near={ACTIVITY_NEAR}
            />
            <small>{formatPercent(row.pct)}</small>
          </span>
        ) : (
          '—'
        )}
      </td>
      <td>
        <StatusChip small status={row.status} />
      </td>
    </tr>
  );
}

// Costed activities, plus the General bucket, versus the cost of the time
// charged to each (picked by hand, matched from notes, or General by default).
export default function FinancialsActivities({ overview, onEditProject }) {
  const withActivities = overview.projects.filter(
    (item) => item.activities.length,
  );
  return (
    <section className="fin-section" aria-labelledby="fin-activities-title">
      <header className="fin-section-head">
        <div>
          <h3 id="fin-activities-title">Costings</h3>
          <span>
            Each costing vs the cost of time charged to it ·{' '}
            <span className="costing-source source-picked">picked</span> by
            hand, <span className="costing-source source-auto">auto</span> from
            the note, or{' '}
            <span className="costing-source source-default">default</span> to
            General
          </span>
        </div>
      </header>
      {withActivities.length === 0 ? (
        <div className="fin-empty is-inline">
          <span className="fin-empty-glyph" aria-hidden="true">≡</span>
          <div>
            <h3>No costings yet</h3>
            <p>
              Break a budget into costed deliverables, such as “Quick reference
              guides (QRGs) · $4,000” or “Training deck · 3 days”, in the
              project’s Budget section. Notes like “drafted QRGs” are matched
              automatically, you can pick or split by hand, and anything else
              is charged to General.
            </p>
          </div>
          {overview.projects[0] && (
            <button
              type="button"
              onClick={() => onEditProject(overview.projects[0].id)}
            >
              Add costings
            </button>
          )}
        </div>
      ) : (
        <div className="fin-table-scroll">
          <table className="fin-activities">
            <thead>
              <tr>
                <th scope="col">Costing</th>
                <th scope="col">Amount ex GST</th>
                <th scope="col">Actual</th>
                <th scope="col">Variance</th>
                <th scope="col" className="fin-bar-col">
                  Used
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            {withActivities.map((item) => (
              <tbody key={item.id}>
                <tr className="fin-project-row">
                  <th scope="rowgroup" colSpan={6}>
                    <i
                      className="project-ring"
                      style={{ color: item.color }}
                      aria-hidden="true"
                    />
                    {item.name}
                    <small>
                      {formatMoney(item.costingTotal, { whole: true })} costed
                      {item.hasBudget &&
                        ` of ${formatMoney(item.budget, { whole: true })}`}
                    </small>
                  </th>
                </tr>
                {item.activities.map((activity) => (
                  <CostingRow
                    key={activity.id}
                    row={activity}
                    item={item}
                    perDay={overview.perDay}
                  />
                ))}
                {item.generalCosting && (
                  <CostingRow
                    row={item.generalCosting}
                    item={item}
                    perDay={overview.perDay}
                    isGeneral
                  />
                )}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  );
}
