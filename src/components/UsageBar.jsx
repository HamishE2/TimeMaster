import { EPSILON, fmt } from '../lib/utils.js';

// One continuous bar for a project's week: logged hours against the usable
// allowance. Only meaningful portions get their own segment: hours borrowed
// from next week (frontloaded in), hours lent to last week, and overage.
export default function UsageBar({ metrics: m }) {
  if (m.plan == null || !(m.effective > 0 || m.logged > 0)) return null;
  const plan = Number(m.plan),
    lent = Math.min(plan, m.frontloadedOut || 0),
    borrowed = m.frontloadedIn || 0,
    own = Math.max(0, plan - lent),
    usable = Math.max(0, m.effective),
    scale = Math.max(own + borrowed + lent, m.logged, EPSILON),
    pct = (n) => `${(100 * Math.max(0, n)) / scale}%`,
    within = Math.min(m.logged, usable),
    over = Math.max(0, m.logged - usable);
  const parts = [`${fmt(m.logged)} of ${fmt(usable)}h used`];
  if (borrowed > EPSILON)
    parts.push(`${fmt(borrowed)}h frontloaded from next week`);
  if (lent > EPSILON) parts.push(`${fmt(lent)}h lent to last week`);
  if (over > EPSILON) parts.push(`${fmt(over)}h over`);
  const label = parts.join(' · ');
  return (
    <span className="usage-bar" title={label}>
      <span className="usage-track" role="img" aria-label={label}>
        {borrowed > EPSILON && (
          <span
            className="usage-borrowed"
            style={{ left: pct(own), width: pct(borrowed) }}
          />
        )}
        {lent > EPSILON && (
          <span
            className="usage-lent"
            style={{ left: pct(own + borrowed), width: pct(lent) }}
          />
        )}
        <span className="usage-fill" style={{ width: pct(within) }} />
        {over > EPSILON && (
          <span
            className="usage-over"
            style={{ left: pct(usable), width: pct(over) }}
          />
        )}
      </span>
      <span className={`usage-text${over > EPSILON ? ' over' : ''}`}>
        {fmt(m.logged)} / {fmt(usable)}h
      </span>
    </span>
  );
}
