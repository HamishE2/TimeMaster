import { useRef, useState } from 'react';
const key = 'timemaster.columnWidths.v1';
export function useColumnWidths() {
  const [widths, setWidths] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key));
      return Object.fromEntries(
        Object.entries(stored || {}).filter(
          ([, size]) => Number.isInteger(size) && size >= 58 && size <= 900,
        ),
      );
    } catch {
      return {};
    }
  });
  const latest = useRef(widths);
  function change(id, width) {
    latest.current = { ...latest.current, [id]: width };
    setWidths(latest.current);
  }
  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(latest.current));
    } catch {
      // The current session still supports resizing with storage disabled.
    }
  }
  return { widths, change, save };
}
