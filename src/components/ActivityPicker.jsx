import { useId, useState } from 'react';
import { matchActivity, NOT_COSTED } from '../lib/activityMatch.js';
import { entryActivityTag } from '../lib/entryNotes.js';
import { normaliseActivities } from '../lib/budget.js';

// "Which activity is this?" for one time entry. Self-contained: it reads the
// project's costed activities and the entry's tag, matches the (draft) note,
// and reports an explicit choice through onTag(activityId | NOT_COSTED | null).
// null clears the tag so the note is matched automatically again.
export default function ActivityPicker({
  project,
  taskId,
  week,
  day,
  note = '',
  hours,
  onTag,
  compact = false,
}) {
  const id = useId(),
    [changing, setChanging] = useState(false);
  const activities = normaliseActivities(project?.activities);
  if (!activities.length || hours === null) return null;
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const rawTag = entryActivityTag(project, taskId, week, day),
    tag = rawTag === NOT_COSTED || byId.has(rawTag) ? rawTag : null;
  const text = String(note || '').trim();
  const match = text ? matchActivity(text, activities) : null;
  const candidates = (match?.candidates || [])
    .filter((candidate) => byId.has(candidate.activityId))
    .slice(0, 4);
  const auto =
    match?.status === 'match' ? byId.get(match.activityId) : null;
  const confidence = (score) => `${Math.round(score * 100)}%`;

  let state, summary;
  if (tag === NOT_COSTED) {
    state = 'chosen';
    summary = (
      <>
        <b>Not a costed activity</b> <small>· your choice</small>
      </>
    );
  } else if (tag) {
    state = 'chosen';
    summary = (
      <>
        <b>{byId.get(tag).name}</b> <small>· your choice</small>
      </>
    );
  } else if (auto) {
    state = 'matched';
    summary = (
      <>
        <b>{auto.name}</b>{' '}
        <small>
          · matched from note ({confidence(match.candidates[0]?.score || 1)})
        </small>
      </>
    );
  } else {
    state = 'ask';
    summary = (
      <>
        <b>Which activity is this?</b>{' '}
        <small>
          {!text
            ? 'Add a note or choose one.'
            : match?.status === 'ambiguous'
              ? 'The note fits more than one costing.'
              : match?.status === 'vague'
                ? 'The note is too general to link.'
                : 'No costed activity matches the note.'}
        </small>
      </>
    );
  }
  const shown = new Set(candidates.map((candidate) => candidate.activityId));
  // In the small entry popover a settled entry is a one-line chip; the
  // chooser only opens for unclear notes or when asked.
  if (compact && state !== 'ask' && !changing) {
    const name =
      tag === NOT_COSTED ? 'Not costed' : (byId.get(tag) || auto).name;
    return (
      <div className={`activity-picker is-${state} is-compact is-chip`}>
        <span className="activity-chip" title={tag ? 'Your choice' : 'Matched from the note'}>
          <span aria-hidden="true">→</span> {name}{' '}
          <small>({tag ? 'chosen' : 'auto'})</small>
        </span>
        <button
          type="button"
          className="activity-change"
          aria-label={`Change activity, currently ${name}`}
          onClick={() => setChanging(true)}
        >
          Change
        </button>
      </div>
    );
  }
  return (
    <div
      className={`activity-picker is-${state}${compact ? ' is-compact' : ''}`}
    >
      <p id={`${id}-summary`} aria-live="polite">
        <span className="activity-picker-label">Activity</span> {summary}
      </p>
      <label className="sr-only" htmlFor={`${id}-select`}>
        Which costed activity is this time for?
      </label>
      <select
        id={`${id}-select`}
        aria-describedby={`${id}-summary`}
        value={tag || ''}
        onChange={(event) => onTag?.(event.target.value || null)}
      >
        <option value="">
          {tag ? 'Match from the note again' : auto ? 'Matched automatically' : 'Choose an activity…'}
        </option>
        {candidates.length > 0 && !auto && (
          <optgroup label="Best matches">
            {candidates.map((candidate) => (
              <option key={candidate.activityId} value={candidate.activityId}>
                {byId.get(candidate.activityId).name} ·{' '}
                {confidence(candidate.score)}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label={candidates.length && !auto ? 'All activities' : 'Activities'}>
          {activities
            .filter((activity) => auto || !shown.has(activity.id))
            .map((activity) => (
              <option key={activity.id} value={activity.id}>
                {activity.name}
              </option>
            ))}
        </optgroup>
        <option value={NOT_COSTED}>Not a costed activity</option>
      </select>
    </div>
  );
}
