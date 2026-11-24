import { useState } from 'react';
import { formatMoney } from '../lib/budget.js';
import { DAY_SHORT, dayDate, fmt } from '../lib/utils.js';
import ActivityPicker from './ActivityPicker.jsx';

const REASONS = {
  ambiguous: 'Fits several costings',
  vague: 'Vague note',
  partial: 'Part matched',
  none: 'No costing matched',
  'no-note': 'No note',
};
const PAGE = 8;

const shortDate = (item) =>
  `${DAY_SHORT[item.day]} ${dayDate(item.week, item.day).toLocaleDateString(
    'en-AU',
    { day: 'numeric', month: 'short' },
  )}`;

// Entries whose time went to General because the note was vague, fitted
// several costings or only partly matched. Nothing is wrong: the person can
// pick a costing (or split) by hand, which is stored as an explicit tag.
// Entries with the same project, line and note are grouped so one pick
// covers them all.
export default function FinancialsReview({ review, projects, onTag }) {
  const [showAll, setShowAll] = useState(false),
    [limit, setLimit] = useState(PAGE);
  const toCheck = review.filter((item) => item.check),
    list = showAll ? review : toCheck,
    others = review.length - toCheck.length;
  const groups = [];
  const byKey = new Map();
  for (const item of list) {
    const key = `${item.projectId}|${item.taskId}|${item.note.trim().toLowerCase()}|${item.status}`;
    if (!byKey.has(key)) {
      const group = { key, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).items.push(item);
  }
  return (
    <section className="fin-section" aria-labelledby="fin-review-title">
      <header className="fin-section-head">
        <div>
          <h3 id="fin-review-title">
            Check costings{' '}
            {toCheck.length > 0 && (
              <span className="fin-count">{toCheck.length}</span>
            )}
          </h3>
          <span>
            Time that went to General because the note was vague or fitted
            several costings. Nothing is wrong; pick a costing if it belongs to
            one.
          </span>
        </div>
        {others > 0 && (
          <label className="switch-row">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(event) => setShowAll(event.target.checked)}
            />
            <span>Show {others} other General entries</span>
          </label>
        )}
      </header>
      {groups.length === 0 ? (
        <div className="fin-empty is-inline is-good">
          <span className="fin-empty-glyph" aria-hidden="true">✓</span>
          <div>
            <h3>Nothing to check</h3>
            <p>
              {review.length
                ? `No vague or ambiguous notes. ${others} other entr${others === 1 ? 'y is' : 'ies are'} costed to General; show them above to pick costings by hand.`
                : 'Every entry on a costed project has a costing, picked or matched, or there are no costings yet.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <ul className="fin-review">
            {groups.slice(0, limit).map(({ key, items }) => {
              const [first] = items,
                project = projects.get(first.projectId),
                hours = items.reduce((sum, item) => sum + item.hours, 0),
                cost = items.reduce((sum, item) => sum + item.cost, 0);
              return (
                <li key={key}>
                  <div className="fin-review-what">
                    <q className="fin-review-note">{first.note || 'No note'}</q>
                    <span className="fin-review-meta">
                      <strong>{first.projectName}</strong> · {first.taskName} ·{' '}
                      {items.length === 1
                        ? shortDate(first)
                        : `${items.length} entries, latest ${shortDate(first)}`}
                    </span>
                  </div>
                  <span className="fin-review-amount fin-num">
                    {fmt(Math.round(hours * 100) / 100)}h
                    <small>{first.hasRate ? formatMoney(cost) : '—'}</small>
                  </span>
                  <span className={`fin-reason reason-${first.status}`}>
                    {REASONS[first.status] || 'General'}
                  </span>
                  {project && (
                    <div className="fin-review-pick">
                      <ActivityPicker
                        project={project}
                        taskId={first.taskId}
                        week={first.week}
                        day={first.day}
                        note={first.note}
                        hours={first.hours}
                        compact
                        hint={false}
                        onTag={(tag) => items.forEach((item) => onTag(item, tag))}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {groups.length > limit && (
            <button
              type="button"
              className="fin-more"
              onClick={() => setLimit(limit + PAGE)}
            >
              Show {Math.min(PAGE, groups.length - limit)} more
            </button>
          )}
        </>
      )}
    </section>
  );
}
