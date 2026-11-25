import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../lib/budget.js';

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
