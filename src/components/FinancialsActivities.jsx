import {
  ACTIVITY_NEAR,
  formatEffort,
  formatMoney,
  formatPercent,
} from '../lib/budget.js';
import { fmt } from '../lib/utils.js';
import { BudgetMeter, StatusChip } from './FinancialsParts.jsx';

// Whether a costing's time was assigned by hand (manual) or by the app
// (auto: matched from the note, or General by default). Only the final
// assignment counts: a pick that overrode a match is just manual. Historical
// usage entered by hand is badged "history".
function SourceBadges({ bySource, historical = false }) {
  const shown = [
    bySource?.picked > 0 && 'manual',
    (bySource?.auto > 0 || bySource?.default > 0) && 'auto',
    historical && 'history',
  ].filter(Boolean);
  if (!shown.length) return null;
  return (
    <span className="costing-sources">
      {shown.map((label) => (
        <span key={label} className="costing-source">
          {label}
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
        <SourceBadges bySource={row.bySource} historical={row.historical} />
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
          <span>Spend vs costing</span>
        </div>
      </header>
      {withActivities.length === 0 ? (
        <div className="fin-empty is-inline">
          <span className="fin-empty-glyph" aria-hidden="true">
            ≡
          </span>
          <div>
            <h3>No costings yet</h3>
            <p>Add costed deliverables in a project’s Budget section.</p>
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
