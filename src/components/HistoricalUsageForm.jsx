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
import {
  BigField,
  ChoiceGroup,
  RemainderRow,
  ReviewList,
  StepDialog,
  StepNote,
  StepSection,
} from './StepForm.jsx';

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
  { value: 'hours', label: 'Hours', sub: 'Time worked' },
  { value: 'money', label: 'Dollars', sub: 'Amount spent' },
];

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
    <StepSection title={title} help={hint}>
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
      </ul>
      <RemainderRow
        label={restLabel}
        value={formatUsage(left, unit)}
        over={left < 0}
      />
      {overError && (
        <p className="field-error" role="alert">
          {overError}
        </p>
      )}
    </StepSection>
  );
}

// "Add historical usage data": work done on a project before it was logged
// here, as one total broken down by phase bucket and by costing. One question per step, with large buttons and fields and Back /
// Next (or the step pills) to move between them. The phase and costing steps
// only appear when the project has any. Only your own time is recorded.
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
  const jump = (i) => {
    setTried((current) => ({ ...current, [step]: true }));
    setStepIndex(i);
  };
  const stepHasErrors = (name) =>
    Object.keys(result.errors).some((key) => STEP_FIELDS[name](key));
  const back = () => (index === 0 ? onClose() : setStepIndex(index - 1));

  return (
    <StepDialog
      title={record ? 'Edit historical usage' : 'Add historical usage data'}
      steps={steps.map((name) => STEP_NAMES[name])}
      index={index}
      onBack={back}
      onNext={next}
      onJump={jump}
      editing={!!record}
      locked={steps.map((name) => name !== 'project' && !project)}
      stepErrors={steps.map(
        (name) =>
          name !== 'check' && (!!record || !!tried[name]) && stepHasErrors(name),
      )}
      onClose={onClose}
      finishLabel={record ? 'Save changes' : 'Add usage'}
      nextDisabled={!project}
    >
      {step === 'project' && (
        <StepSection title="Which project is it for?">
          {projects.length === 0 ? (
            <p className="help">Add a project first.</p>
          ) : (
            <ChoiceGroup
              ariaLabel="Project"
              cols={3}
              value={pid}
              onChange={(id) => {
                if (id === pid) return;
                setPid(id);
                // Phases and costings belong to the old project.
                set({ phases: {}, activities: {} });
              }}
              options={projects.map((item) => ({
                value: item.id,
                label: item.name,
                sub: item.client || 'No client',
                color: item.color || 'var(--muted)',
                disabled: !!record && item.id !== pid,
              }))}
            />
          )}
        </StepSection>
      )}

      {step === 'amount' && (
        <StepSection
          title={`How much was used on ${project?.name}?`}
        >
          <ChoiceGroup
            ariaLabel="Count it in"
            cols={2}
            value={unit}
            onChange={(value) => set({ unit: value })}
            options={UNITS}
          />
          <BigField
            id="hist-total"
            label={unit === 'money' ? 'Total spent' : 'Total hours'}
            prefix={unit === 'money' ? '$' : null}
            unit={unit === 'money' ? 'AUD' : 'hours'}
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
        </StepSection>
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
          restLabel="Balance allocated to General"
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
          restLabel="Balance allocated to General costing"
          errors={errors}
          overError={errors.activities}
        />
      )}

      {step === 'check' && (
        <StepSection title="Check and save">
          <ReviewList
            rows={[
              ['Project', project?.name],
              [
                result.record?.label || 'Name',
                `${formatUsage(result.total, unit)}${
                  draft.asOf
                    ? ` up to ${new Date(`${draft.asOf}T12:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : ''
                }`,
              ],
              ...(phases.length > 0 && result.record
                ? [
                    [
                      'By phase',
                      [{ id: 'general', name: 'General' }, ...phases]
                        .filter((task) => result.record.phases[task.id])
                        .map(
                          (task) =>
                            `${task.name} ${formatUsage(result.record.phases[task.id], unit)}`,
                        )
                        .join(' · '),
                    ],
                  ]
                : []),
              ...(activities.length > 0 && result.record
                ? [
                    [
                      'By costing',
                      [...activities, { id: 'none', name: 'General costing' }]
                        .filter(
                          (activity) => result.record.activities[activity.id],
                        )
                        .map(
                          (activity) =>
                            `${activity.name} ${formatUsage(result.record.activities[activity.id], unit)}`,
                        )
                        .join(' · '),
                    ],
                  ]
                : []),
            ]}
          />
          {Object.keys(result.errors).length > 0 && (
            <p className="field-error" role="alert">
              Something needs fixing. Use Back to correct it.
            </p>
          )}
        </StepSection>
      )}

      {step === 'check' && impact && (
        <StepNote>
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
        </StepNote>
      )}
    </StepDialog>
  );
}
