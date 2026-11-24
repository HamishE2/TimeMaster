import { useState } from 'react';
import { formatMoney } from '../lib/budget.js';
import { DAY_SHORT, dayDate, fmt } from '../lib/utils.js';
import ActivityPicker from './ActivityPicker.jsx';

const REASONS = {
  ambiguous: 'Fits several',
  vague: 'Too vague',
  none: 'No match',
  'no-note': 'No note',
};
const PAGE = 10;

// Entries on projects with costings whose activity is still unknown. Picking
// an activity stores an explicit tag, which overrides note matching.
export default function FinancialsReview({ review, projects, onTag }) {
  const [showNoNote, setShowNoNote] = useState(false),
    [limit, setLimit] = useState(PAGE);
  const withNotes = review.filter((item) => item.status !== 'no-note'),
    list = showNoNote ? review : withNotes,
    noNote = review.length - withNotes.length;
  return (
    <section className="fin-section" aria-labelledby="fin-review-title">
      <header className="fin-section-head">
        <div>
          <h3 id="fin-review-title">
            Review queue{' '}
            {list.length > 0 && <span className="fin-count">{list.length}</span>}
          </h3>
          <span>Which activity is each of these for?</span>
        </div>
        {noNote > 0 && (
          <label className="switch-row">
            <input
              type="checkbox"
              checked={showNoNote}
              onChange={(event) => setShowNoNote(event.target.checked)}
            />
            <span>Include {noNote} without notes</span>
          </label>
        )}
      </header>
      {list.length === 0 ? (
        <div className="fin-empty is-inline is-good">
          <span className="fin-empty-glyph" aria-hidden="true">✓</span>
          <div>
            <h3>Nothing to review</h3>
            <p>
              {review.length
                ? `Every note is linked. ${noNote} entr${noNote === 1 ? 'y has' : 'ies have'} no note; include them above to tag them too.`
                : 'Every entry on a costed project is linked to an activity, tagged as not costed, or there are no costings yet.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <ul className="fin-review">
            {list.slice(0, limit).map((item) => {
              const project = projects.get(item.projectId),
                date = dayDate(item.week, item.day);
              return (
                <li
                  key={`${item.projectId}|${item.taskId}|${item.week}|${item.day}`}
                >
                  <div className="fin-review-meta">
                    <span className="fin-review-date">
                      {DAY_SHORT[item.day]}{' '}
                      <b>
                        {date.toLocaleDateString('en-AU', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </b>
                    </span>
                    <span>
                      <strong>{item.projectName}</strong> · {item.taskName}
                    </span>
                    <span className="fin-num">
                      {fmt(item.hours)}h · {formatMoney(item.cost)}
                    </span>
                    <span className={`fin-reason reason-${item.status}`}>
                      {REASONS[item.status] || 'Unlinked'}
                    </span>
                  </div>
                  {item.note && <q className="fin-review-note">{item.note}</q>}
                  {project && (
                    <ActivityPicker
                      project={project}
                      taskId={item.taskId}
                      week={item.week}
                      day={item.day}
                      note={item.note}
                      hours={item.hours}
                      onTag={(activityId) => onTag(item, activityId)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          {list.length > limit && (
            <button
              type="button"
              className="fin-more"
              onClick={() => setLimit(limit + PAGE)}
            >
              Show {Math.min(PAGE, list.length - limit)} more of{' '}
              {list.length - limit}
            </button>
          )}
        </>
      )}
    </section>
  );
}
