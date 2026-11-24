import { ACTIVITY_NEAR, formatMoney, formatPercent } from '../lib/budget.js';
import { BudgetMeter, StatusChip } from './FinancialsParts.jsx';

// Costed activities versus what has been logged against them.
export default function FinancialsActivities({ overview, onEditProject }) {
  const withActivities = overview.projects.filter(
    (item) => item.activities.length,
  );
  const { hasRate } = overview;
  return (
    <section className="fin-section" aria-labelledby="fin-activities-title">
      <header className="fin-section-head">
        <div>
          <h3 id="fin-activities-title">Costed activities</h3>
          <span>Costing vs the cost of time linked through notes and tags</span>
        </div>
      </header>
      {withActivities.length === 0 ? (
        <div className="fin-empty is-inline">
          <span className="fin-empty-glyph" aria-hidden="true">≡</span>
          <div>
            <h3>No costed activities</h3>
            <p>
              Break a budget into deliverables, such as “Quick reference guides
              (QRGs) · $4,000” or “Training deck · $2,500”, in the project’s
              Budget section. Notes like “drafted QRGs” are then linked
              automatically, and you’re asked when a note is unclear.
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
                <th scope="col">Activity</th>
                <th scope="col">Costing</th>
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
                  <tr key={activity.id}>
                    <th scope="row" className="fin-line">
                      {activity.name}
                      <small>
                        {Math.round(activity.hours * 100) / 100}h ·{' '}
                        {activity.entries}{' '}
                        {activity.entries === 1 ? 'entry' : 'entries'}
                      </small>
                    </th>
                    <td className="fin-num">
                      {formatMoney(activity.amount, { whole: true })}
                    </td>
                    <td className="fin-num">
                      {hasRate ? formatMoney(activity.spent) : '—'}
                    </td>
                    <td>
                      {hasRate && activity.variance != null ? (
                        <span
                          className={`fin-variance ${activity.variance < 0 ? 'is-over' : 'is-under'}`}
                        >
                          {activity.variance < 0
                            ? `${formatMoney(-activity.variance, { whole: true })} over`
                            : `${formatMoney(activity.variance, { whole: true })} left`}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="fin-bar-col">
                      {hasRate && activity.amount != null ? (
                        <span className="fin-bar-cell">
                          <BudgetMeter
                            spent={activity.spent}
                            budget={activity.amount}
                            tone={activity.status.tone}
                            near={ACTIVITY_NEAR}
                          />
                          <small>{formatPercent(activity.pct)}</small>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <StatusChip small status={activity.status} />
                    </td>
                  </tr>
                ))}
                {item.unlinked.entries > 0 && (
                  <tr className="is-unlinked">
                    <th scope="row" className="fin-line">
                      Not linked to an activity
                      <small>
                        {Math.round(item.unlinked.hours * 100) / 100}h ·{' '}
                        {item.unlinked.entries}{' '}
                        {item.unlinked.entries === 1 ? 'entry' : 'entries'}
                      </small>
                    </th>
                    <td className="fin-num">—</td>
                    <td className="fin-num">
                      {hasRate ? formatMoney(item.unlinked.spent) : '—'}
                    </td>
                    <td colSpan={3} className="fin-muted">
                      General time, “not costed” tags and notes still to review
                    </td>
                  </tr>
                )}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  );
}
