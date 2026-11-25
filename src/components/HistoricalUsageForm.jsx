import { useState } from 'react';
import {
  formatEffort,
  formatMoney,
  formatUsage,
  historicalDraftOf,
  hoursPerDay,
  normaliseActivities,
  projectFinance,
  projectRateOf,
  setHistoricalUsageRecord,
  validateHistoricalDraft,
} from '../lib/budget.js';
import { phasesOf } from '../lib/tasks.js';
import { uuid } from '../lib/utils.js';
import Modal from './Modal.jsx';

// Which errors belong to which step.
const STEP_FIELDS = {
  project: () => false,
  amount: (key) => ['label', 'asOf', 'total'].includes(key),
  phases: (key) => key === 'phases' || key.startsWith('phase:'),
  costings: (key) => key === 'activities' || key.startsWith('activity:'),
  check: () => true,
};
const STEP_NAMES = {
  project: 'Project',
  amount: 'Amount',
  phases: 'By phase',
  costings: 'By costing',
  check: 'Check',
};

const UNITS = [
  ['hours', 'Hours', 'Time worked'],
  ['money', 'Dollars', 'Amount spent'],
];

// One big field: a label, a large input with an optional unit, and a hint or
// an error underneath.
function BigField({ id, label, unit, prefix, hint, error, ...input }) {
  return (
    <div className="cfg-field">
      <label htmlFor={id}>{label}</label>
      <span className={`cfg-input${error ? ' is-error' : ''}`}>
        {prefix && <span aria-hidden="true">{prefix}</span>}
        <input id={id} aria-invalid={!!error} {...input} />
        {unit && <span>{unit}</span>}
      </span>
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : (
        hint && <small className="help">{hint}</small>
      )}
    </div>
  );
}

// A breakdown of the total: one big field per bucket, with what is left
// shown as the General row.
function Breakdown({
  title,
  hint,
  rows,
  values,
  onChange,
  unit,
  left,
  restLabel,
  errors,
  prefix,
  overError,
}) {
  return (
    <section className="cfg-section" aria-labelledby="cfg-step-title">
      <h3 id="cfg-step-title">{title}</h3>
      <p className="help">{hint}</p>
      <ul className="cfg-rows">
        {rows.map((row) => (
          <li key={row.id}>
            <BigField
              id={`hist-${prefix}-${row.id}`}
              label={row.name}
              hint={row.hint}
              error={errors[`${prefix}:${row.id}`]}
              prefix={unit === 'money' ? '$' : null}
              unit={unit === 'money' ? null : 'h'}
              inputMode="decimal"
              placeholder="0"
              value={values[row.id] ?? ''}
              onChange={(event) =>
                onChange({ ...values, [row.id]: event.target.value })
              }
            />
          </li>
        ))}
        <li className={`cfg-rest${left < 0 ? ' is-over' : ''}`}>
          <span>{restLabel}</span>
          <b>{left < 0 ? '—' : formatUsage(left, unit)}</b>
        </li>
      </ul>
      {overError && (
        <p className="field-error" role="alert">
          {overError}
        </p>
      )}
    </section>
  );
}

// "Add historical usage data": work done on a project before it was logged
// here, as one total broken down by phase bucket and by costing. One question
// per step, with large buttons and fields and Back / Next to move between
// them. The phase and costing steps only appear when the project has any.
export default function HistoricalUsageForm({
  projects,
  settings,
  week,
  projectId = null,
  record = null,
  onSave,
  onClose,
}) {
  const [pid, setPid] = useState(projectId || projects[0]?.id || '');
  // A new record gets its id up front so it stays the same while typing.
  const [draft, setDraft] = useState(() => {
    const initial = historicalDraftOf(record);
    return { ...initial, id: initial.id || `history-${uuid()}` };
  });
  // Steps whose errors are shown (after Next was pressed on them).
  const [tried, setTried] = useState({});
  const [stepIndex, setStepIndex] = useState(record ? 1 : 0);
  const project = projects.find((item) => item.id === pid) || null;
  const phases = phasesOf(project || {}),
    activities = normaliseActivities(project?.activities),
    rate = projectRateOf(project, settings),
    perDay = hoursPerDay(settings);
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const result = validateHistoricalDraft(draft, project || {});
  const { unit } = result;
  const steps = [
    'project',
    'amount',
    phases.length > 0 && 'phases',
    activities.length > 0 && 'costings',
    'check',
  ].filter(Boolean);
  const index = Math.min(stepIndex, steps.length - 1),
    step = steps[index],
    isLast = index === steps.length - 1;
  const stepErrors = Object.keys(result.errors).filter((key) =>
    STEP_FIELDS[step](key),
  );
  // Field errors wait for Next; the "adds up to more" check shows at once.
  const errors = Object.fromEntries(
    Object.entries(result.errors).filter(
      ([key]) =>
        ['phases', 'activities'].includes(key) ||
        steps.some((name) => tried[name] && STEP_FIELDS[name](key)),
    ),
  );
  const impact = (() => {
    if (!project || !result.record) return null;
    const before = projectFinance(project, settings, week),
      after = projectFinance(
        setHistoricalUsageRecord(project, result.record),
        settings,
        week,
      );
    return { before, after, cost: after.spent - before.spent };
  })();

  const effortHint = () => {
    if (result.total == null) return null;
    if (unit === 'money')
      return rate
        ? formatEffort(result.total, rate, perDay)
        : 'Counted as given, even without a rate.';
    return rate
      ? `${formatMoney(result.total * rate)} at ${formatMoney(rate)}/h`
      : 'No hourly rate yet, so hours cost $0 until one is set.';
  };
  const next = () => {
    setTried((current) => ({ ...current, [step]: true }));
    if (step === 'project' && !project) return;
    if (stepErrors.length) return;
    if (!isLast) {
      setStepIndex(index + 1);
      return;
    }
    if (project && result.record) onSave(project.id, result.record);
  };
  const back = () => (index === 0 ? onClose() : setStepIndex(index - 1));

  return (
    <Modal
      title={record ? 'Edit historical usage' : 'Add historical usage data'}
      onClose={onClose}
      wide
    >
      <form
        className="cfg-form"
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
        noValidate
      >
        <ol className="cfg-steps" aria-label="Steps">
          {steps.map((name, i) => (
            <li
              key={name}
              aria-current={i === index ? 'step' : undefined}
              className={i < index ? 'is-done' : ''}
            >
              <span aria-hidden="true">{i < index ? '✓' : i + 1}</span>
              {STEP_NAMES[name]}
            </li>
          ))}
        </ol>
        <p className="cfg-count">
          Step {index + 1} of {steps.length}
        </p>

        {step === 'project' && (
          <section className="cfg-section" aria-labelledby="cfg-step-title">
            <h3 id="cfg-step-title">Which project is it for?</h3>
            {projects.length === 0 ? (
              <p className="help">Add a project first.</p>
            ) : (
              <div
                className="cfg-choices"
                role="radiogroup"
                aria-labelledby="cfg-step-title"
              >
                {projects.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={item.id === pid}
                    disabled={!!record && item.id !== pid}
                    className="cfg-choice"
                    style={{ '--pc': item.color || 'var(--muted)' }}
                    onClick={() => {
                      if (item.id === pid) return;
                      setPid(item.id);
                      // Phases and costings belong to the old project.
                      set({ phases: {}, activities: {} });
                    }}
                  >
                    <i className="cfg-dot" aria-hidden="true" />
                    <b>{item.name}</b>
                    <small>{item.client || 'No client'}</small>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {step === 'amount' && (
          <section className="cfg-section" aria-labelledby="cfg-step-title">
            <h3 id="cfg-step-title">How much was used on {project?.name}?</h3>
            <div
              className="cfg-choices is-pair"
              role="radiogroup"
              aria-label="Count it in"
            >
              {UNITS.map(([value, label, sub]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={unit === value}
                  className="cfg-choice"
                  onClick={() => set({ unit: value })}
                >
                  <b>{label}</b>
                  <small>{sub}</small>
                </button>
              ))}
            </div>
            <BigField
              id="hist-total"
              label={unit === 'money' ? 'Total spent' : 'Total hours'}
              prefix={unit === 'money' ? '$' : null}
              unit={unit === 'money' ? 'AUD ex GST' : 'hours'}
              inputMode="decimal"
              placeholder={unit === 'money' ? '4,000' : '32.5'}
              value={draft.total}
              error={errors.total}
              hint={effortHint()}
              onChange={(event) => set({ total: event.target.value })}
              autoFocus
            />
            <div className="cfg-pair">
              <BigField
                id="hist-label"
                label="Name"
                placeholder="Before TimeMaster"
                value={draft.label}
                error={errors.label}
                onChange={(event) => set({ label: event.target.value })}
              />
              <BigField
                id="hist-as-of"
                label="Up to (optional)"
                type="date"
                value={draft.asOf}
                error={errors.asOf}
                hint="Places it on the spend chart."
                onChange={(event) => set({ asOf: event.target.value })}
              />
            </div>
          </section>
        )}

        {step === 'phases' && (
          <Breakdown
            title={`Which phases was the ${formatUsage(result.total, unit)} spent on?`}
            hint="Leave a phase blank if none of it went there."
            prefix="phase"
            unit={unit}
            rows={phases.map((task) => ({
              id: task.id,
              name: task.name,
              hint:
                project.phaseBudgets?.[task.id] != null
                  ? `Budget ${formatMoney(project.phaseBudgets[task.id], { whole: true })}`
                  : null,
            }))}
            values={draft.phases}
            onChange={(phasesDraft) => set({ phases: phasesDraft })}
            left={result.phases.left}
            restLabel="Unallocated · assigned to General"
            errors={errors}
            overError={errors.phases}
          />
        )}

        {step === 'costings' && (
          <Breakdown
            title={`Which costings did the ${formatUsage(result.total, unit)} go to?`}
            hint="Leave a costing blank if none of it went there."
            prefix="activity"
            unit={unit}
            rows={activities.map((activity) => ({
              id: activity.id,
              name: activity.name,
              hint:
                activity.amount != null
                  ? `Costed at ${formatMoney(activity.amount, { whole: true })}`
                  : null,
            }))}
            values={draft.activities}
            onChange={(activitiesDraft) => set({ activities: activitiesDraft })}
            left={result.activities.left}
            restLabel="Unallocated · assigned to General costing"
            errors={errors}
            overError={errors.activities}
          />
        )}

        {step === 'check' && (
          <section className="cfg-section" aria-labelledby="cfg-step-title">
            <h3 id="cfg-step-title">Check and save</h3>
            <dl className="cfg-review">
              <div>
                <dt>Project</dt>
                <dd>{project?.name}</dd>
              </div>
              <div>
                <dt>{result.record?.label || 'Name'}</dt>
                <dd>
                  {formatUsage(result.total, unit)}
                  {draft.asOf &&
                    ` up to ${new Date(`${draft.asOf}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                </dd>
              </div>
              {phases.length > 0 && result.record && (
                <div>
                  <dt>By phase</dt>
                  <dd>
                    {[{ id: 'general', name: 'General' }, ...phases]
                      .filter((task) => result.record.phases[task.id])
                      .map(
                        (task) =>
                          `${task.name} ${formatUsage(result.record.phases[task.id], unit)}`,
                      )
                      .join(' · ')}
                  </dd>
                </div>
              )}
              {activities.length > 0 && result.record && (
                <div>
                  <dt>By costing</dt>
                  <dd>
                    {[...activities, { id: 'none', name: 'General costing' }]
                      .filter(
                        (activity) => result.record.activities[activity.id],
                      )
                      .map(
                        (activity) =>
                          `${activity.name} ${formatUsage(result.record.activities[activity.id], unit)}`,
                      )
                      .join(' · ')}
                  </dd>
                </div>
              )}
            </dl>
            {Object.keys(result.errors).length > 0 && (
              <p className="field-error" role="alert">
                Something needs fixing. Use Back to correct it.
              </p>
            )}
          </section>
        )}

        {step === 'check' && impact && (
          <p className="cfg-summary" aria-live="polite">
            Adds{' '}
            <b>
              {impact.after.hasRate || unit === 'money'
                ? formatMoney(impact.cost)
                : '—'}
            </b>
            .
            {impact.after.hasBudget && impact.after.hasRate && (
              <>
                {' '}
                Spent goes from{' '}
                {formatMoney(impact.before.spent, { whole: true })} to{' '}
                <b>{formatMoney(impact.after.spent, { whole: true })}</b> of{' '}
                {formatMoney(impact.after.budget, { whole: true })}.
              </>
            )}
          </p>
        )}

        <div className="cfg-actions">
          <button type="button" className="cfg-button" onClick={back}>
            {index === 0 ? 'Cancel' : '← Back'}
          </button>
          <button
            type="submit"
            className="cfg-button primary"
            disabled={!project}
          >
            {isLast ? (record ? 'Save changes' : 'Add usage') : 'Next →'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
