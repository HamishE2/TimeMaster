import { useState } from 'react';
import { DAY_SHORT, DEFAULT_VISIBLE_DAYS, EPSILON, fmt } from '../lib/utils.js';

export default function Overview({ totals, week, settings }) {
  const [expanded, setExpanded] = useState(false);
  const usedPct = totals.capacity ? (totals.logged / totals.capacity) * 100 : 0,
    over = totals.remaining < -EPSILON;
  const leave = (settings.leaveWeeks?.[week] || []).filter((day) =>
    settings.visibleDays?.includes(day),
  );
  return (
    <article className="horizon">
      <p className="readout-label">Logged this week</p>
      <strong className="readout-value">
        {fmt(totals.logged)}
        <small>h</small>
      </strong>
      <div
        aria-hidden="true"
        className={`readout-meter ${over ? 'excess' : ''}`}
      >
        <i style={{ width: Math.min(usedPct, 100) + '%' }} />
      </div>
      <div className="readout-note">
        <b>
          {fmt(Math.abs(totals.remaining))}h {over ? 'over' : 'free'}
        </b>{' '}
        of {fmt(totals.capacity)}h · {Math.round(usedPct)}%
        {leave.length > 0 &&
          ' · ' + leave.map((d) => DAY_SHORT[d]).join(', ') + ' on leave'}
      </div>
      <button
        className="daily-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        Daily capacity {expanded ? '−' : '+'}
      </button>
      <div className={`horizon-days ${expanded ? 'expanded' : ''}`}>
        {(settings.visibleDays || DEFAULT_VISIBLE_DAYS).map((day) => (
          <span key={day}>
            {DAY_SHORT[day]}
            <b>
              {fmt(
                (settings.leaveWeeks?.[week] || []).includes(day)
                  ? 0
                  : settings.capacityByDay?.[day] || 0,
              )}
              h
            </b>
          </span>
        ))}
      </div>
    </article>
  );
}
