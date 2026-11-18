import { EPSILON, WEEKLY_RESOURCING_CAPACITY, fmt } from '../lib/utils.js';

export default function CounterRail({ totals, projects, onFill, onCapacity }) {
  const bill = Math.round(totals.billablePct),
    capacityWarning = totals.resourcingCapacity > 3 + EPSILON;
  return (
    <aside className="counter-rail" aria-label="Workspace counters">
      <article className="dial-card">
        <div className="dial" style={{ '--dial': `${bill * 3.6}deg` }}>
          <div>
            <strong>{totals.logged ? `${bill}%` : '—'}</strong>
            <span>Billable</span>
          </div>
        </div>
        <p>
          <b>{fmt(totals.billable)}h</b> billable
          <br />
          <span>{fmt(totals.logged - totals.billable)}h non-billable</span>
          <span className="resourced-counter">
            {fmt(totals.resourced)}h of {fmt(WEEKLY_RESOURCING_CAPACITY)}h
            resourced
          </span>
        </p>
      </article>
      <button
        className="overview-stat capacity-stat capacity-widget"
        onClick={onCapacity}
        aria-label="View capacity breakdown"
      >
        <p>Capacity</p>
        <strong className={capacityWarning ? 'capacity-warning' : ''}>
          {fmt(totals.resourcingCapacity)}h{capacityWarning && ' !'}
        </strong>
        <span>
          Unresourced hours this week
          {totals.frontloading > EPSILON &&
            ` · includes ${fmt(totals.frontloading)}h frontloading adjustment`}
        </span>
      </button>
      <article className="overview-stat">
        <p>Projects</p>
        <strong>{projects.length}</strong>
        <span>
          {fmt(totals.today)}h logged today ·{' '}
          {totals.over
            ? `${totals.over} over allocation`
            : 'allocations in range'}
        </span>
        <button onClick={onFill} disabled={totals.remaining <= 0}>
          Fill remaining
        </button>
      </article>
    </aside>
  );
}
