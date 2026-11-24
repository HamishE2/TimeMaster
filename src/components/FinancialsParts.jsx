import { useEffect, useRef, useState } from 'react';
import { formatMoney, percentOf } from '../lib/budget.js';

// Shape + text, not colour alone: each tone has its own glyph.
const GLYPHS = {
  neutral: '–',
  green: '✓',
  amber: '!',
  yellow: 'i',
  red: '×',
};

export function StatusChip({ status, small = false }) {
  const tone = status?.tone || 'neutral';
  return (
    <span
      className={`fin-chip tone-${tone}${small ? ' is-small' : ''}`}
      title={status?.message || undefined}
    >
      <i aria-hidden="true">{GLYPHS[tone]}</i>
      {status?.label || 'No budget'}
    </span>
  );
}

// Spent (solid) and planned spend (hatched) against a budget, with the amber
// threshold marked.
export function BudgetMeter({
  spent,
  budget,
  forecast = null,
  tone = 'neutral',
  near = 0.75,
  label,
}) {
  if (budget == null) return null;
  const scale = Math.max(budget, spent, forecast ?? 0, 0.01),
    pct = (value) => `${Math.min(100, (Math.max(0, value) / scale) * 100)}%`;
  return (
    <div
      className={`fin-meter tone-${tone}`}
      role="img"
      aria-label={
        label ||
        `${formatMoney(spent)} spent of ${formatMoney(budget)}${forecast != null ? `, ${formatMoney(forecast)} with the resourcing plan` : ''}`
      }
    >
      {forecast != null && forecast > spent && (
        <span className="fin-meter-plan" style={{ width: pct(forecast) }} />
      )}
      <span className="fin-meter-spent" style={{ width: pct(spent) }} />
      {budget > 0 && (
        <>
          <span className="fin-meter-tick" style={{ left: pct(budget * near) }} />
          {scale > budget && (
            <span className="fin-meter-limit" style={{ left: pct(budget) }} />
          )}
        </>
      )}
    </div>
  );
}

// Percentage-used ring. The number in the middle carries the meaning; the
// arc and tone only reinforce it.
export function UsageRing({ pct, tone = 'neutral', size = 58, label }) {
  const r = 22,
    c = 2 * Math.PI * r,
    shown = pct == null ? 0 : Math.min(1, Math.max(0, pct)),
    text =
      pct == null ? '—' : pct === Infinity ? '!' : `${percentOf(pct)}`;
  return (
    <svg
      className={`fin-ring tone-${tone}`}
      viewBox="0 0 58 58"
      width={size}
      height={size}
      role="img"
      aria-label={label || (pct == null ? 'No budget' : `${text}% of budget used`)}
    >
      <circle className="fin-ring-track" cx="29" cy="29" r={r} />
      <circle
        className="fin-ring-arc"
        cx="29"
        cy="29"
        r={r}
        strokeDasharray={`${shown * c} ${c}`}
        transform="rotate(-90 29 29)"
      />
      {pct != null && pct > 1 && pct !== Infinity && (
        <circle
          className="fin-ring-over"
          cx="29"
          cy="29"
          r={r}
          strokeDasharray={`${Math.min(1, pct - 1) * c} ${c}`}
          transform="rotate(-90 29 29)"
        />
      )}
      <text x="29" y="29" dominantBaseline="central" textAnchor="middle">
        {text}
        {pct != null && pct !== Infinity && <tspan className="fin-ring-unit">%</tspan>}
      </text>
    </svg>
  );
}

// Cumulative spend over recent weeks, with the budget as a dashed line.
export function SpendSparkline({ series, budget, tone = 'neutral' }) {
  if (!series?.length) return null;
  const w = 120,
    h = 34,
    top = Math.max(budget ?? 0, ...series.map((point) => point.spent), 0.01),
    x = (i) => (series.length === 1 ? w : (i / (series.length - 1)) * w),
    y = (v) => h - 2 - (v / top) * (h - 4);
  const line = series.map((point, i) => `${x(i)},${y(point.spent)}`).join(' ');
  const first = series[0],
    last = series.at(-1);
  return (
    <svg
      className={`fin-spark tone-${tone}`}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Cumulative spend went from ${formatMoney(first.spent)} to ${formatMoney(last.spent)} over the last ${series.length} weeks`}
    >
      {budget != null && budget > 0 && (
        <line className="fin-spark-budget" x1="0" x2={w} y1={y(budget)} y2={y(budget)} />
      )}
      <polyline className="fin-spark-area" points={`0,${h} ${line} ${w},${h}`} />
      <polyline className="fin-spark-line" points={line} />
      <circle className="fin-spark-dot" cx={x(series.length - 1)} cy={y(last.spent)} r="2.5" />
    </svg>
  );
}

// One bar split into segments (cost by phase or activity) with a text legend.
export function StackedBar({ segments, label }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return <p className="fin-muted">Nothing costed yet.</p>;
  const shown = segments.filter((segment) => segment.value > 0);
  return (
    <div className="fin-stack">
      <div className="fin-stack-bar" role="img" aria-label={label}>
        {shown.map((segment, i) => (
          <span
            key={segment.id}
            className={`seg-${i % 6}`}
            style={{ width: `${(segment.value / total) * 100}%` }}
            title={`${segment.name}: ${formatMoney(segment.value)}`}
          />
        ))}
      </div>
      <ul className="fin-stack-legend">
        {shown.map((segment, i) => (
          <li key={segment.id}>
            <i className={`seg-${i % 6}`} aria-hidden="true" />
            <span>{segment.name}</span>
            <b>{formatMoney(segment.value, { whole: true })}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// A money figure that counts to its new value like the timesheet counters.
export function TickMoney({ value, whole = true }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value || value == null || start == null || reducedMotion()) {
      setShown(value);
      return undefined;
    }
    let frame,
      t0 = null;
    const step = (now) => {
      t0 ??= now;
      const k = Math.min(1, (now - t0) / 300),
        ease = 1 - (1 - k) ** 3;
      setShown(start + (value - start) * ease);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className="tick-number">{formatMoney(shown, { whole })}</span>;
}
