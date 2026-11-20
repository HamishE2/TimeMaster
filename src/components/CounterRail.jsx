import { EPSILON, WEEKLY_RESOURCING_CAPACITY, fmt } from '../lib/utils.js';

export default function CounterRail({ totals, projects, onFill, onCapacity }) {
  const bill = Math.round(totals.billablePct),
    overCapacity = Math.max(0, totals.resourced - WEEKLY_RESOURCING_CAPACITY),
    capacityWarning = totals.resourcingCapacity > 3 + EPSILON;
  return (
    <aside className="counter-rail" aria-label="Workspace counters">
      <article className="dial-card">
        <p className="readout-label">Billable</p>
        <strong className="readout-value">
          {totals.logged ? bill : '—'}
          {totals.logged > 0 && <small>%</small>}
        </strong>
        <div className="readout-meter" aria-hidden="true">
          <i style={{ width: bill + '%' }} />
        </div>
        <p>
          <b>{fmt(totals.billable)}h</b> billable ·{' '}
          <span>{fmt(totals.logged - totals.billable)}h non-billable</span>
          <br />
          {fmt(totals.resourced)}h of {fmt(WEEKLY_RESOURCING_CAPACITY)}h
          resourced
        </p>
      </article>
      <button
        className="overview-stat capacity-stat capacity-widget"
        onClick={onCapacity}
        aria-label="View capacity breakdown"
      >
        <p className="readout-label">Capacity</p>
        <strong
          className={
            overCapacity > EPSILON
              ? 'over-text'
              : capacityWarning
                ? 'capacity-warning'
                : ''
          }
        >
          {fmt(overCapacity || totals.resourcingCapacity)}
          <small>h</small>
        </strong>
        <span>
          {overCapacity > EPSILON
            ? 'Over the weekly allocation'
            : 'Unresourced hours this week'}
          {totals.frontloading > EPSILON &&
            ` · ${fmt(totals.frontloading)}h frontloaded`}
        </span>
        <u>Breakdown →</u>
      </button>
      <article className="overview-stat">
        <p className="readout-label">Projects</p>
        <strong>{projects.length}</strong>
        <span>
          {fmt(totals.today)}h logged today
          {totals.over > 0 && (
            <b className="over-text"> · {totals.over} over allocation</b>
          )}
        </span>
        <button onClick={onFill} disabled={totals.remaining <= 0}>
          Fill remaining
        </button>
      </article>
    </aside>
  );
}
