import { EPSILON, WEEKLY_RESOURCING_CAPACITY, fmt } from '../lib/utils.js';

export default function CounterRail({ totals, projects, onFill, onCapacity }) {
  const bill = Math.round(totals.billablePct),
    overCapacity = Math.max(0, totals.resourced - WEEKLY_RESOURCING_CAPACITY),
    capacityWarning = totals.resourcingCapacity > 3 + EPSILON;
  return (
    <aside className="counter-rail" aria-label="Workspace counters">
      <article className="dial-card">
        <p>Billable</p>
        <strong>{totals.logged ? `${bill}%` : '—'}</strong>
        <p>
          <b>{fmt(totals.billable)}h</b> billable
          <br />
          <span>{fmt(totals.logged - totals.billable)}h non-billable</span>
        </p>
      </article>
      <button
        className="overview-stat capacity-stat capacity-widget"
        onClick={onCapacity}
        aria-label="View capacity breakdown"
      >
        <p>
          {overCapacity > EPSILON ? 'Over capacity' : 'Available capacity'} ↗
        </p>
        <strong
          className={
            overCapacity > EPSILON
              ? 'over-text'
              : capacityWarning
                ? 'capacity-warning'
                : ''
          }
        >
          {fmt(overCapacity || totals.resourcingCapacity)}h
        </strong>
        <span>
          {fmt(totals.resourced)} / {fmt(WEEKLY_RESOURCING_CAPACITY)}h resourced
          {totals.frontloading > EPSILON &&
            ` · ${fmt(totals.frontloading)}h frontloaded`}
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
