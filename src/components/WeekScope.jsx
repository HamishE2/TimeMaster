// Five-week glyph: two weeks back, the current week (taller), two weeks ahead.
// Affected weeks are filled, or hatched red when `removing` is set.
const patterns = {
  week: [0],
  retro: [-2, -1],
  onwards: [0, 1, 2],
  'next-onwards': [1, 2],
  project: [-2, -1, 0, 1, 2],
};

export default function WeekScope({ scope, removing = false }) {
  const affected = patterns[scope] || [];
  return (
    <span className="week-scope" aria-hidden="true">
      {[-2, -1, 0, 1, 2].map((offset) => (
        <i
          key={offset}
          className={[
            affected.includes(offset) ? (removing ? 'gone' : 'on') : '',
            offset === 0 ? 'now' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      ))}
    </span>
  );
}
