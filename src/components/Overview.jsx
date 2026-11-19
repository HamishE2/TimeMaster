import { useState } from 'react';
import { DAY_SHORT, DEFAULT_VISIBLE_DAYS, EPSILON, fmt } from '../lib/utils.js';

export default function Overview({ totals, week, settings }) {
  const [expanded, setExpanded] = useState(false);
  const usedPct = totals.capacity ? (totals.logged / totals.capacity) * 100 : 0,
    over = totals.remaining < -EPSILON;
  return (
    <article className="horizon" aria-label="Week horizon">
      <div className="horizon-head">
        <div>
          <p>Time logged</p>
          <strong>
            {fmt(totals.logged)}
            <span>h</span>
          </strong>
        </div>
        <div className="horizon-counters">
          <span className={over ? 'over-text' : ''}>
            {over
              ? `${fmt(-totals.remaining)}h over`
              : `${fmt(Math.max(0, totals.remaining))}h free`}
          </span>
        </div>
      </div>
      <div className="horizon-track">
        <span style={{ width: `${Math.min(100, usedPct)}%` }} />
        <em className={usedPct > 100 + EPSILON ? 'show' : ''}>
          {Math.round(usedPct)}%
        </em>
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
