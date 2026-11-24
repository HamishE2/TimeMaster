import {
  activityTagCounts,
  daysToMoney,
  formatEffort,
  formatMoney,
  fromCents,
  parseMoney,
  parseRate,
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
  perDay = 7.6,
}) {
  const ownRate = parseRate(draft.hourlyRate ?? '').value ?? null,
    rate = ownRate ?? hourlyRate;
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
    rate > 0 && amount != null ? formatEffort(amount, rate, perDay) : null;
  const activityDollars = (activity) => {
    const typed = parseMoney(activity.amount).value;
    if (typed == null) return null;
    if (
      activity.unit === 'days' &&
      activity.fromDollars != null &&
      activity.amount === activity.daysText
    )
      return Number(activity.fromDollars);
    return activity.unit === 'days' ? daysToMoney(typed, rate, perDay) : typed;
  };

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
          <span>AUD ex GST</span>
        </span>
        {errors.budget ? (
          <span className="field-error">{errors.budget}</span>
        ) : (
          <small className="help">
            {hoursHint(budget) ? (
              <b className="budget-effort">{hoursHint(budget)}</b>
            ) : null}{' '}
            Optional.
          </small>
        )}
      </div>

      <div className="field">
        <label htmlFor="project-rate">Project hourly rate</label>
        <span
          className={`unit-input ${errors.hourlyRate ? 'input-error' : ''}`}
        >
          <span aria-hidden="true">$</span>
          <input
            id="project-rate"
            inputMode="decimal"
            placeholder={
              hourlyRate == null
                ? 'Not set'
                : `${hourlyRate} (workspace rate)`
            }
            value={draft.hourlyRate ?? ''}
            aria-invalid={!!errors.hourlyRate}
            onChange={(event) => set({ hourlyRate: event.target.value })}
          />
          <span>AUD ex GST / h</span>
        </span>
        {errors.hourlyRate ? (
          <span className="field-error">{errors.hourlyRate}</span>
        ) : (
          <small className="help">
            Optional. Blank uses the workspace rate
            {hourlyRate == null ? '' : ` (${formatMoney(hourlyRate)}/h)`}.
          </small>
        )}
      </div>

      {phases.length > 0 && (
        <div className="field budget-buckets">
          <span className="budget-subhead">Phase budgets</span>
          <small className="help">
            Optional. Other time draws from the total.
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
          Matched from entry notes. Aliases help.
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
                  <span className="unit-input costing-amount">
                    {activity.unit !== 'days' && (
                      <span aria-hidden="true">$</span>
                    )}
                    <input
                      aria-label={`Activity ${index + 1} costing in ${activity.unit === 'days' ? 'days' : 'dollars ex GST'}`}
                      inputMode="decimal"
                      placeholder="0"
                      value={activity.amount}
                      onChange={(event) =>
                        setActivity(activity.id, { amount: event.target.value })
                      }
                    />
                    <span
                      className="costing-unit"
                      role="radiogroup"
                      aria-label={`Activity ${index + 1} unit`}
                    >
                      {[
                        ['$', '$'],
                        ['days', 'days'],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={(activity.unit || '$') === value}
                          disabled={value === 'days' && !(rate > 0)}
                          title={
                            value === 'days' && !(rate > 0)
                              ? 'Set an hourly rate to enter days'
                              : value === 'days'
                                ? `Days of ${perDay}h at ${formatMoney(rate)}/h`
                                : 'Dollars ex GST'
                          }
                          onClick={() => {
                            if ((activity.unit || '$') === value) return;
                            const dollars = activityDollars(activity),
                              amount =
                                dollars == null
                                  ? activity.amount
                                  : value === 'days'
                                    ? String(
                                        Math.round(
                                          (dollars / (rate * perDay)) * 100,
                                        ) / 100,
                                      )
                                    : String(dollars);
                            // Remember the exact dollars so switching to days
                            // and back (or saving unchanged) is lossless.
                            setActivity(
                              activity.id,
                              value === 'days'
                                ? {
                                    unit: value,
                                    amount,
                                    fromDollars:
                                      dollars == null ? null : String(dollars),
                                    daysText: amount,
                                  }
                                : {
                                    unit: value,
                                    amount:
                                      activity.fromDollars != null &&
                                      activity.amount === activity.daysText
                                        ? activity.fromDollars
                                        : amount,
                                    fromDollars: null,
                                    daysText: null,
                                  },
                            );
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="phase-remove"
                    aria-label={`Remove activity ${activity.name || index + 1}`}
                    title={
                      tagged
                        ? `${tagged} tagged ${tagged === 1 ? 'entry' : 'entries'} go back to auto`
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
                  {(errors[key] || tagged > 0 || activityDollars(activity) != null) && (
                    <small
                      className={errors[key] ? 'field-error' : 'help'}
                    >
                      {errors[key] || (
                        <>
                          {activityDollars(activity) != null &&
                            (activity.unit === 'days'
                              ? `= ${formatMoney(activityDollars(activity))} ex GST`
                              : hoursHint(activityDollars(activity)))}
                          {tagged > 0 &&
                            ` · ${tagged} tagged ${tagged === 1 ? 'entry' : 'entries'}`}
                        </>
                      )}
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
                { id: uuid(), name: '', amount: '', aliases: '', unit: '$' },
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
