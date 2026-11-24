import { useEffect, useRef, useState } from 'react';
import { fmt } from '../lib/utils.js';

const reduced = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// A number that counts to its new value (about 300ms) and flashes once.
export default function TickNumber({ value, suffix = '' }) {
  const [shown, setShown] = useState(value);
  const [bump, setBump] = useState(0);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value) return;
    const instant = reduced();
    let frame,
      t0 = null;
    const step = (now) => {
      if (t0 == null) {
        t0 = now;
        setBump((n) => n + 1);
        if (instant) return setShown(value);
      }
      const k = Math.min(1, (now - t0) / 300),
        ease = 1 - (1 - k) ** 3;
      setShown(start + (value - start) * ease);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <span className={`tick-number${bump ? ' is-ticking' : ''}`} key={bump}>
      {fmt(Math.round(shown * 100) / 100)}
      {suffix}
    </span>
  );
}
