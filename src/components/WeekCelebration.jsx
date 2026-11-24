import { useEffect, useRef, useState } from 'react';
import { fmt } from '../lib/utils.js';
import { weekIsComplete } from '../lib/weekGoal.js';

const KEY = 'timemaster.celebrated';
const seen = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
};
const remember = (week) => {
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen(), week].slice(-60)));
  } catch {
    // Storage blocked: the celebration may show again, which is harmless.
  }
};
const COLOURS = ['#f5c518', '#2f8f5b', '#3b82f6', '#e0607e', '#8b5cf6'];

// One-shot burst when an edit completes a week at 80%+ billable. Opening or
// navigating to a week that is already complete stays quiet, and each week
// celebrates at most once (undo then redo does not repeat it).
export default function WeekCelebration({ week, totals }) {
  const done = weekIsComplete(totals);
  const [burst, setBurst] = useState(0);
  const last = useRef({ week, done });
  useEffect(() => {
    const before = last.current;
    last.current = { week, done };
    if (!done || before.done || before.week !== week) return;
    if (seen().includes(week)) return;
    remember(week);
    const start = setTimeout(() => setBurst(Date.now()), 0);
    return () => clearTimeout(start);
  }, [done, week]);
  useEffect(() => {
    if (!burst) return;
    const stop = setTimeout(() => setBurst(0), 3200);
    return () => clearTimeout(stop);
  }, [burst]);
  if (!burst) return null;
  const pct = Math.round((100 * totals.billable) / Math.max(totals.logged, 0.01));
  return (
    <div className="week-celebration" role="status" key={burst}>
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 36 }, (_, i) => (
          <i
            key={i}
            style={{
              '--x': `${Math.cos((i / 36) * Math.PI * 2) * (120 + (i % 5) * 40)}px`,
              '--y': `${Math.sin((i / 36) * Math.PI * 2) * (90 + (i % 4) * 35) - 60}px`,
              '--r': `${(i * 47) % 360}deg`,
              '--d': `${(i % 6) * 30}ms`,
              background: COLOURS[i % COLOURS.length],
            }}
          />
        ))}
      </div>
      <p>
        <b>Week logged</b> {fmt(totals.logged)}h · {pct}% billable
      </p>
    </div>
  );
}
