import {
  activityTagCounts,
  formatMoney,
  fromCents,
  parseMoney,
  toCents,
} from '../lib/budget.js';
import { isGeneralTask } from '../lib/tasks.js';
import { uuid } from '../lib/utils.js';

// Budget, phase buckets and costed activities in the project editor. The
// parent owns the text draft; validation lives in validateFinanceDraft.
export default function ProjectBudgetFields({
  draft,
  onChange,
  tasks,
  initial,
  errors = {},
  warnings = [],
  hourlyRate = null,
}) {
  const phases = tasks.filter((task) => !isGeneralTask(task));
  const set = (patch) => onChange({ ...draft, ...patch });
  const budget = parseMoney(draft.budget).value ?? null;
  const bucketCents = phases.reduce(
    (sum, task) =>
      sum + toCents(parseMoney(draft.phaseBudgets[task.id]).value || 0),
    0,
  );
  const tagCounts = activityTagCounts(initial);
  const setActivity = (id, patch) =>
    set({
      activities: draft.activities.map((activity) =>
        activity.id === id ? { ...activity, ...patch } : activity,
      ),
    });
  const hoursHint = (amount) =>
    hourlyRate > 0 && amount != null
      ? `≈ ${Math.round((amount / hourlyRate) * 10) / 10}h at ${formatMoney(hourlyRate)}/h`
      : null;

  return (
    <div className="budget-fields">
      <div className="field">
        <label htmlFor="project-budget">Total budget</label>
        <span className={`unit-input ${errors.budget ? 'input-error' : ''}`}>
          <span aria-hidden="true">$</span>
          <input
            id="project-budget"
            inputMode="decimal"
            placeholder="No budget"
            value={draft.budget}
            aria-invalid={!!errors.budget}
            onChange={(event) => set({ budget: event.target.value })}
          />
          <span>AUD</span>
        </span>
        {errors.budget ? (
          <span className="field-error">{errors.budget}</span>
        ) : (
          <small className="help">
            Optional. Logged time is costed at your hourly rate
            {hourlyRate == null ? ' once you set one in Settings' : ''}.
            {hoursHint(budget) && <> {hoursHint(budget)}.</>}
          </small>
        )}
      </div>

      {phases.length > 0 && (
        <div className="field budget-buckets">
          <span className="budget-subhead">Phase budgets</span>
          <small className="help">
            Optional buckets. Time on General, or on a phase without a
            bucket, draws from what is left of the total.
          </small>
          <ul>
            {phases.map((task) => {
              const key = `phase:${task.id}`;
              return (
                <li key={task.id}>
                  <label htmlFor={`phase-budget-${task.id}`}>{task.name}</label>
                  <span
                    className={`unit-input ${errors[key] ? 'input-error' : ''}`}
                  >
                    <span aria-hidden="true">$</span>
                    <input
                      id={`phase-budget-${task.id}`}
                      inputMode="decimal"
                      placeholder="Shared"
                      value={draft.phaseBudgets[task.id] ?? ''}
                      aria-invalid={!!errors[key]}
                      onChange={(event) =>
                        set({
                          phaseBudgets: {
                            ...draft.phaseBudgets,
                            [task.id]: event.target.value,
                          },
                        })
                      }
                    />
                  </span>
                  {errors[key] && (
                    <span className="field-error">{errors[key]}</span>
                  )}
                </li>
              );
            })}
            <li className="budget-unallocated">
              <span>General &amp; unbudgeted phases</span>
              <b>
                {budget == null
                  ? 'No total set'
                  : formatMoney(
                      fromCents(Math.max(0, toCents(budget) - bucketCents)),
                    )}
              </b>
            </li>
          </ul>
        </div>
      )}

      <div className="field costings">
        <span className="budget-subhead">Costed activities</span>
        <small className="help">
          Deliverables with their own costing, such as “Quick reference guides
          (QRGs)” at $4,000. Time is linked through entry notes, or by choosing
          the activity when a note is unclear. Aliases help matching.
        </small>
        {draft.activities.length > 0 && (
          <ul className="costing-list">
            {draft.activities.map((activity, index) => {
              const key = `activity:${activity.id}`,
                tagged = tagCounts[activity.id] || 0;
              return (
                <li key={activity.id} className="costing-row">
                  <input
                    aria-label={`Activity ${index + 1} name`}
                    placeholder="Activity name"
                    value={activity.name}
                    aria-invalid={!!errors[key]}
                    onChange={(event) =>
                      setActivity(activity.id, { name: event.target.value })
                    }
                  />
                  <span className="unit-input">
                    <span aria-hidden="true">$</span>
                    <input
                      aria-label={`Activity ${index + 1} costing`}
                      inputMode="decimal"
                      placeholder="0"
                      value={activity.amount}
                      onChange={(event) =>
                        setActivity(activity.id, { amount: event.target.value })
                      }
                    />
                  </span>
                  <button
                    type="button"
                    className="phase-remove"
                    aria-label={`Remove activity ${activity.name || index + 1}`}
                    title={
                      tagged
                        ? `${tagged} tagged ${tagged === 1 ? 'entry' : 'entries'} will become untagged`
                        : 'Remove activity'
                    }
                    onClick={() =>
                      set({
                        activities: draft.activities.filter(
                          (item) => item.id !== activity.id,
                        ),
                      })
                    }
                  >
                    ×
                  </button>
                  <input
                    className="costing-aliases"
                    aria-label={`Activity ${index + 1} aliases`}
                    placeholder="Also known as… (comma separated, optional)"
                    value={activity.aliases}
                    onChange={(event) =>
                      setActivity(activity.id, { aliases: event.target.value })
                    }
                  />
                  {(errors[key] || tagged > 0) && (
                    <small
                      className={errors[key] ? 'field-error' : 'help'}
                    >
                      {errors[key] ||
                        `${tagged} ${tagged === 1 ? 'entry is' : 'entries are'} tagged to this activity; removing it untags them.`}
                    </small>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          className="costing-add"
          onClick={() =>
            set({
              activities: [
                ...draft.activities,
                { id: uuid(), name: '', amount: '', aliases: '' },
              ],
            })
          }
        >
          + Add costed activity
        </button>
      </div>

      {warnings.length > 0 && (
        <ul className="budget-warnings" role="status">
          {warnings.map((warning) => (
            <li key={warning}>
              <b>Check:</b> {warning}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
