import { useState } from 'react';
import {
  fmt,
  getCategorizedProjects,
  historicalHoursForWeek,
  monthlyPlan,
  uuid,
} from '../lib/utils.js';
import { validateProjectDraft } from '../lib/projectOperations.js';
import { isGeneralTask, phaseHours } from '../lib/tasks.js';
import {
  BUDGET_FOCUS,
  PROJECTWORKS_FOCUS,
  activityTagCounts,
  daysToMoney,
  financeDraftOf,
  formatEffort,
  formatMoney,
  fromCents,
  parseMoney,
  parseProjectworksUrl,
  parseRate,
  toCents,
  validateFinanceDraft,
} from '../lib/budget.js';
import {
  BigField,
  ChoiceGroup,
  RemainderRow,
  ReviewList,
  StepDialog,
  StepNote,
  StepSection,
} from './StepForm.jsx';

// Chronograph project palette (matches the --proj-* tokens in the mockups).
const PROJECT_COLOURS = [
  '#0e8c7e',
  '#6b4fd8',
  '#e0533a',
  '#b5870f',
  '#3e7d3a',
  '#2e86c1',
  '#c2457a',
  '#5b6472',
];
const STEPS = [
  'Details',
  'Type',
  'Hours',
  'Phases',
  'Budget',
  'Costings',
  'Check',
];
// Which validation errors belong to which step.
const STEP_ERRORS = {
  Details: (key) => key === 'name' || key === 'projectworksUrl',
  Type: (key) => key === 'duration',
  Hours: (key) =>
    ['hours', 'monthlyHours', 'historicalMonthly', 'remainderLimit'].includes(
      key,
    ),
  Phases: (key) => key === 'tasks',
  Budget: (key) =>
    ['budget', 'hourlyRate', 'phases'].includes(key) ||
    key.startsWith('phase:'),
  Costings: (key) => key.startsWith('activity:'),
  Check: () => false,
};
const DURATIONS = [
  { value: '1 day', label: '1 day', weeks: 0, days: 1 },
  { value: '1 week', label: '1 week', weeks: 1, days: 0 },
  { value: '2 weeks', label: '2 weeks', weeks: 2, days: 0 },
  { value: 'custom', label: 'Custom' },
];
const GENERAL = { id: 'general', name: 'General' };
const blankActivity = () => ({
  id: uuid(),
  name: '',
  amount: '',
  aliases: '',
  levelId: '',
  unit: '$',
});
const hasPhaseTime = (project, taskId) =>
  Object.values(project?.taskEntries?.[taskId] || {}).some((week) =>
    Object.values(week || {}).some((value) => Number(value) > 0),
  );

// Every editable field of a project, as the dialog holds it while typing.
function draftOf(project, weekKey) {
  const oneTime = project?.projectType === 'one-time';
  const preset = !oneTime
    ? '1 week'
    : DURATIONS.find(
        (item) =>
          item.weeks === (project.durationWeeks || 0) &&
          item.days === (project.durationDays || 0),
      )?.value || 'custom';
  const unlimitedBase =
    project?.resourcedHours === null || project?.resourcedHours === undefined;
  const override =
    project?.weeklyOverrides && Object.hasOwn(project.weeklyOverrides, weekKey);
  const hours = override
    ? project.weeklyOverrides[weekKey]
    : project?.resourcedHours;
  const monthly = project ? monthlyPlan(project, weekKey) : null;
  const finance = financeDraftOf(project);
  return {
    name: project?.name ?? '',
    client: project?.client ?? '',
    code: project?.code ?? '',
    projectworksUrl: project?.projectworksUrl ?? '',
    status: project?.status ?? 'active',
    color: project?.color ?? PROJECT_COLOURS[0],
    isBillable: project?.isBillable ?? true,
    projectType: project?.projectType || 'standard',
    durationPreset: preset,
    durationWeeks: oneTime ? project.durationWeeks || 0 : 1,
    durationDays: oneTime ? project.durationDays || 0 : 0,
    remainderLimit: oneTime ? String(project.remainderLimit ?? '') : '',
    // A new project starts with hours to fill in, not Unlimited.
    unlimited: !project
      ? false
      : override
        ? hours === null || hours === undefined
        : unlimitedBase,
    hours: hours === null || hours === undefined ? '' : String(hours),
    monthlyHours:
      monthly === null || monthly === undefined ? '' : String(monthly),
    historicalMonthly: project
      ? String(historicalHoursForWeek(project, weekKey) || '')
      : '',
    tasks: project?.tasks?.length ? project.tasks : [GENERAL],
    finance: {
      ...finance,
      activities: [...finance.activities, blankActivity()],
    },
  };
}

// The project editor: Details → Type → Hours → Phases → Budget → Costings →
// Check, one question per step. Editing opens on Details with everything
// filled in ("Edit budget" in the Money tab opens on Budget).
export default function ProjectModal(props) {
  if (!props.isOpen) return null;
  return <ProjectSteps key={props.initial?.id || 'new'} {...props} />;
}

function ProjectSteps({
  focusPhase,
  onClose,
  onSave,
  initial,
  projects = [],
  visibleProjects = [],
  weekKey,
  hourlyRate = null,
  perDay = 7.6,
  rateLevels = [],
  roleName = null,
}) {
  const [draft, setDraft] = useState(() => draftOf(initial, weekKey));
  const [startFrom, setStartFrom] = useState('blank');
  const [selectedExistingId, setSelectedExistingId] = useState(null);
  const [applyScope, setApplyScope] = useState(() =>
    initial
      ? initial.weeklyOverrides &&
        Object.hasOwn(initial.weeklyOverrides, weekKey)
        ? initial.projectType === 'one-time'
          ? 'onwards'
          : 'week'
        : 'project'
      : 'onwards',
  );
  // Every phase the dialog has seen, in order; unticking one keeps it here
  // so it can be ticked again before saving.
  const [phaseList, setPhaseList] = useState(() => draft.tasks);
  const [newPhase, setNewPhase] = useState('');
  const [phaseError, setPhaseError] = useState('');
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [step, setStep] = useState(() =>
    focusPhase === BUDGET_FOCUS
      ? 4
      : focusPhase && focusPhase !== PROJECTWORKS_FOCUS
        ? 3
        : 0,
  );
  const [tried, setTried] = useState({});
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const setFinance = (patch) =>
    setDraft((current) => ({
      ...current,
      finance: { ...current.finance, ...patch },
    }));

  const oneTime = draft.projectType === 'one-time';
  const tasks = draft.tasks;
  const phases = tasks.filter((task) => !isGeneralTask(task));
  const ownRate = parseRate(draft.finance.hourlyRate ?? '').value ?? null;
  const rate = ownRate ?? hourlyRate;
  const showSchedule = !oneTime && ((initial && !draft.unlimited) || !initial);
  const scopeOptions = initial
    ? [
        { value: 'retro', label: 'Past weeks' },
        { value: 'onwards', label: 'This week onwards' },
        { value: 'week', label: 'This week only' },
        { value: 'project', label: 'Entire project' },
      ]
    : [
        { value: 'week', label: 'This week only' },
        { value: 'onwards', label: 'This week onwards' },
        { value: 'next-onwards', label: 'Next week onwards' },
      ];

  // Validation: the project's own checks plus the finance checks.
  const financeResult = validateFinanceDraft(draft.finance, tasks, {
    settingsRate: hourlyRate,
    perDay,
    requirePhaseBudgets: true,
  });
  const projectworks = parseProjectworksUrl(draft.projectworksUrl);
  const allErrors = {
    ...(projectworks.error ? { projectworksUrl: projectworks.error } : {}),
    ...validateProjectDraft({
      name: draft.name,
      unlimited: draft.unlimited,
      hours: draft.hours,
      monthlyHours: oneTime ? '' : draft.monthlyHours,
      historicalMonthly: oneTime ? '' : draft.historicalMonthly,
      projectType: draft.projectType,
      durationWeeks: draft.durationWeeks,
      durationDays: draft.durationDays,
      remainderLimit: draft.remainderLimit,
    }),
    ...financeResult.errors,
  };
  const stepName = STEPS[step];
  const stepErrors = Object.keys(allErrors).filter((key) =>
    STEP_ERRORS[stepName](key),
  );
  // Field errors show after Next; totals that don't add up show at once.
  const errors = Object.fromEntries(
    Object.entries(allErrors).filter(
      ([key]) =>
        key === 'phases' ||
        STEPS.some((name) => tried[name] && STEP_ERRORS[name](key)),
    ),
  );

  const budget = parseMoney(draft.finance.budget).value ?? null;
  const phaseBudgetCents = phases.reduce(
    (sum, task) =>
      sum + toCents(parseMoney(draft.finance.phaseBudgets[task.id]).value || 0),
    0,
  );
  const dollarsOf = (activity) => {
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
  const costingCents = draft.finance.activities.reduce(
    (sum, activity) => sum + toCents(dollarsOf(activity) || 0),
    0,
  );
  const inDays = draft.finance.activities.some(
    (activity) => activity.unit === 'days',
  );
  const tagCounts = activityTagCounts(initial);

  const fillFrom = (project) => {
    const next = draftOf(project, weekKey);
    setDraft(next);
    setPhaseList(next.tasks);
    setSelectedExistingId(project.id);
    setApplyScope(initial ? 'project' : 'onwards');
  };

  const togglePhase = (ids) => {
    const keep = new Set(ids);
    const dropped = tasks.find(
      (task) => !keep.has(task.id) && !isGeneralTask(task),
    );
    if (dropped && hasPhaseTime(initial, dropped.id)) {
      setPendingRemoval(dropped);
      return;
    }
    set({
      tasks: phaseList.filter(
        (task) => isGeneralTask(task) || keep.has(task.id),
      ),
    });
    setPendingRemoval(null);
  };
  const addPhase = () => {
    const value = newPhase.trim();
    if (!value) return;
    if (
      value.toLowerCase() === 'general' ||
      phaseList.some(
        (task) => task.name.trim().toLowerCase() === value.toLowerCase(),
      )
    ) {
      setPhaseError(`There is already a phase called ${value}.`);
      return;
    }
    const task = { id: uuid(), name: value };
    setPhaseList((current) => [...current, task]);
    set({ tasks: [...tasks, task] });
    setNewPhase('');
    setPhaseError('');
  };

  const setActivity = (id, patch) =>
    setDraft((current) => {
      let activities = current.finance.activities.map((activity) =>
        activity.id === id ? { ...activity, ...patch } : activity,
      );
      // Typing in the last row adds a new blank one underneath.
      const last = activities.at(-1);
      if (last && (last.name || last.amount))
        activities = [
          ...activities,
          { ...blankActivity(), unit: last.unit || '$' },
        ];
      return { ...current, finance: { ...current.finance, activities } };
    });
  // Dollars ⇄ days for every activity, remembering exact dollars so the
  // switch is lossless.
  const setUnit = (unit) =>
    setFinance({
      activities: draft.finance.activities.map((activity) => {
        if ((activity.unit || '$') === unit) return activity;
        const dollars = dollarsOf(activity);
        if (unit === 'days') {
          const amount =
            dollars == null
              ? activity.amount
              : String(Math.round((dollars / (rate * perDay)) * 100) / 100);
          return {
            ...activity,
            unit,
            amount,
            fromDollars: dollars == null ? null : String(dollars),
            daysText: amount,
          };
        }
        return {
          ...activity,
          unit,
          amount:
            activity.fromDollars != null &&
            activity.amount === activity.daysText
              ? activity.fromDollars
              : dollars == null
                ? activity.amount
                : String(dollars),
          fromDollars: null,
          daysText: null,
        };
      }),
    });

  const save = () => {
    const saved = onSave(
      draft.name.trim(),
      draft.unlimited ? null : Number(draft.hours),
      draft.isBillable,
      applyScope,
      oneTime || draft.monthlyHours === '' ? null : Number(draft.monthlyHours),
      oneTime || draft.historicalMonthly === ''
        ? 0
        : Number(draft.historicalMonthly),
      draft.client.trim(),
      draft.code.trim(),
      draft.status,
      draft.color,
      selectedExistingId,
      tasks.map((task) => ({
        ...task,
        name: task.name.trim() || 'Untitled task',
      })),
      draft.projectType,
      draft.durationWeeks,
      draft.durationDays,
      draft.remainderLimit === '' ? null : Number(draft.remainderLimit),
      { ...financeResult.value, projectworksUrl: projectworks.value ?? null },
    );
    if (saved !== false) onClose();
  };
  const next = () => {
    setTried((current) => ({ ...current, [stepName]: true }));
    if (stepErrors.length) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else if (Object.keys(allErrors).length === 0) save();
  };

  const { active, inactive } = getCategorizedProjects(
    projects,
    visibleProjects,
  );
  const existing = [...active, ...inactive];
  const swatches = PROJECT_COLOURS.includes(draft.color)
    ? PROJECT_COLOURS
    : [...PROJECT_COLOURS, draft.color];
  const hoursLabel = oneTime
    ? draft.durationWeeks === 0 && draft.durationDays > 0
      ? `Hours for the ${draft.durationDays} day${draft.durationDays === 1 ? '' : 's'}`
      : 'Hours a week'
    : 'Hours a week';
  const money = (value) => formatMoney(value, { whole: true });
  const phaseLabel = ['General', ...phases.map((task) => task.name)].join(
    ' · ',
  );
  const durationText = oneTime
    ? [
        draft.durationWeeks &&
          `${draft.durationWeeks} week${draft.durationWeeks === 1 ? '' : 's'}`,
        draft.durationDays &&
          `${draft.durationDays} day${draft.durationDays === 1 ? '' : 's'}`,
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  return (
    <StepDialog
      title={initial ? initial.name || 'Edit project' : 'New project'}
      steps={STEPS}
      index={step}
      onBack={() => setStep(step - 1)}
      onNext={next}
      onJump={(i) => {
        setTried((current) => ({ ...current, [stepName]: true }));
        setStep(i);
      }}
      editing={!!initial}
      stepErrors={STEPS.map(
        (name) =>
          !!tried[name] &&
          Object.keys(allErrors).some((key) => STEP_ERRORS[name](key)),
      )}
      onClose={onClose}
      finishLabel={initial ? 'Save changes' : 'Create project'}
    >
      {stepName === 'Details' && (
        <StepSection title="What is the project?">
          {!initial && (
            <ChoiceGroup
              label="Start from"
              cols={2}
              value={startFrom}
              onChange={(value) => {
                setStartFrom(value);
                if (value === 'blank') {
                  const blank = draftOf(null, weekKey);
                  setDraft(blank);
                  setPhaseList(blank.tasks);
                  setSelectedExistingId(null);
                }
              }}
              options={[
                { value: 'blank', label: 'Blank project' },
                {
                  value: 'existing',
                  label: 'Reuse an existing project',
                  sub: 'Brings back its phases, budget and colour',
                  disabled: existing.length === 0,
                },
              ]}
            />
          )}
          {!initial && startFrom === 'existing' && (
            <ChoiceGroup
              label="Which project?"
              cols={3}
              value={selectedExistingId}
              onChange={(id) => fillFrom(existing.find((p) => p.id === id))}
              options={existing.map((project) => ({
                value: project.id,
                label: project.name,
                sub:
                  project.resourcedHours == null
                    ? 'Unlimited'
                    : `${fmt(project.resourcedHours)}h a week`,
                color: project.color || 'var(--muted)',
              }))}
            />
          )}
          <BigField
            id="project-name"
            label="Project name"
            placeholder="e.g. Client Dashboard Redesign"
            value={draft.name}
            error={errors.name}
            onChange={(event) => set({ name: event.target.value })}
            autoFocus={focusPhase !== PROJECTWORKS_FOCUS}
          />
          <div className="cfg-pair">
            <BigField
              id="project-client"
              label="Client"
              placeholder="e.g. Contoso Pty Ltd"
              value={draft.client}
              onChange={(event) => set({ client: event.target.value })}
            />
            <BigField
              id="project-code"
              label="Project code"
              placeholder="e.g. PRJ-1042"
              value={draft.code}
              hint="Optional"
              onChange={(event) => set({ code: event.target.value })}
            />
          </div>
          <BigField
            id="project-projectworks"
            label="Projectworks link"
            type="url"
            inputMode="url"
            placeholder="Paste the project’s Projectworks page"
            value={draft.projectworksUrl}
            error={errors.projectworksUrl}
            onChange={(event) => set({ projectworksUrl: event.target.value })}
            autoFocus={focusPhase === PROJECTWORKS_FOCUS}
          />
          {initial && (
            <ChoiceGroup
              label="Status"
              cols={3}
              value={draft.status}
              onChange={(status) => set({ status })}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'on-hold', label: 'On hold' },
                { value: 'closed', label: 'Closed' },
              ]}
            />
          )}
          <ChoiceGroup
            label="Billing"
            cols={2}
            value={draft.isBillable ? 'billable' : 'non-billable'}
            onChange={(value) => set({ isBillable: value === 'billable' })}
            options={[
              { value: 'billable', label: 'Billable' },
              { value: 'non-billable', label: 'Non-billable' },
            ]}
          />
          <div className="cfg-group">
            <span className="cfg-label" id="project-colour-label">
              Colour
            </span>
            <div
              className="cfg-swatches"
              role="radiogroup"
              aria-labelledby="project-colour-label"
            >
              {swatches.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  role="radio"
                  className="cfg-swatch"
                  aria-checked={draft.color === colour}
                  aria-label={`Colour ${colour}`}
                  style={{ '--pc': colour }}
                  onClick={() => set({ color: colour })}
                />
              ))}
              <label className="cfg-swatch is-custom" title="Custom colour">
                <input
                  type="color"
                  value={draft.color}
                  onChange={(event) => set({ color: event.target.value })}
                  aria-label="Custom colour"
                />
              </label>
            </div>
          </div>
        </StepSection>
      )}

      {stepName === 'Type' && (
        <StepSection title="What kind of project is it?">
          <ChoiceGroup
            ariaLabel="Project type"
            cols={2}
            value={draft.projectType}
            onChange={(projectType) => {
              set({ projectType });
              if (
                projectType === 'standard' &&
                initial?.projectType === 'one-time'
              )
                setApplyScope('onwards');
            }}
            options={[
              {
                value: 'standard',
                label: 'Standard',
                sub: 'Runs until you close it',
              },
              {
                value: 'one-time',
                label: 'One-time',
                sub: 'Fixed length, then hidden',
              },
            ]}
          />
          {oneTime && (
            <ChoiceGroup
              label="How long?"
              cols={4}
              value={draft.durationPreset}
              onChange={(value) => {
                const preset = DURATIONS.find((item) => item.value === value);
                set(
                  preset.weeks == null
                    ? { durationPreset: value }
                    : {
                        durationPreset: value,
                        durationWeeks: preset.weeks,
                        durationDays: preset.days,
                      },
                );
              }}
              options={DURATIONS}
            />
          )}
          {oneTime && draft.durationPreset === 'custom' && (
            <div className="cfg-pair">
              <BigField
                id="project-duration-weeks"
                label="Weeks"
                unit="weeks"
                inputMode="numeric"
                value={String(draft.durationWeeks)}
                onChange={(event) =>
                  set({ durationWeeks: Number(event.target.value) || 0 })
                }
              />
              <BigField
                id="project-duration-days"
                label="Days"
                unit="days"
                inputMode="numeric"
                value={String(draft.durationDays)}
                onChange={(event) =>
                  set({ durationDays: Number(event.target.value) || 0 })
                }
              />
            </div>
          )}
          {errors.duration && (
            <p className="field-error" role="alert">
              {errors.duration}
            </p>
          )}
        </StepSection>
      )}

      {stepName === 'Hours' && (
        <StepSection title="How many hours are resourced?">
          <ChoiceGroup
            ariaLabel="Allowance"
            cols={2}
            value={draft.unlimited ? 'unlimited' : 'set'}
            onChange={(value) => {
              set({ unlimited: value === 'unlimited' });
              if (value === 'unlimited')
                setApplyScope(initial ? 'project' : 'onwards');
            }}
            options={[
              { value: 'set', label: 'Set hours', sub: 'A weekly allowance' },
              { value: 'unlimited', label: 'Unlimited', sub: 'No cap' },
            ]}
          />
          {!draft.unlimited && (
            <BigField
              id="project-hours"
              label={hoursLabel}
              unit={oneTime && draft.durationWeeks === 0 ? 'h' : 'h / week'}
              inputMode="decimal"
              placeholder="e.g. 12"
              value={draft.hours}
              error={errors.hours}
              onChange={(event) => set({ hours: event.target.value })}
            />
          )}
          {oneTime && draft.durationWeeks > 0 && draft.durationDays > 0 && (
            <BigField
              id="project-remainder-hours"
              label={`Hours for the last ${draft.durationDays} day${draft.durationDays === 1 ? '' : 's'}`}
              unit="h"
              inputMode="decimal"
              placeholder="e.g. 5"
              value={draft.remainderLimit}
              error={errors.remainderLimit}
              onChange={(event) => set({ remainderLimit: event.target.value })}
            />
          )}
          {!oneTime && !draft.unlimited && (
            <div className="cfg-pair">
              <BigField
                id="project-monthly-hours"
                label="Monthly hours"
                unit="h / month"
                inputMode="decimal"
                placeholder="Optional"
                value={draft.monthlyHours}
                error={errors.monthlyHours}
                hint="Caps the month across its weeks"
                onChange={(event) => set({ monthlyHours: event.target.value })}
              />
              <BigField
                id="project-historical-hours"
                label="Already used this month"
                unit="h"
                inputMode="decimal"
                placeholder="Optional"
                value={draft.historicalMonthly}
                error={errors.historicalMonthly}
                hint="Counts towards the monthly cap"
                onChange={(event) =>
                  set({ historicalMonthly: event.target.value })
                }
              />
            </div>
          )}
          {showSchedule && (
            <ChoiceGroup
              label="Applies from"
              cols={scopeOptions.length > 3 ? 2 : 3}
              value={applyScope}
              onChange={setApplyScope}
              options={scopeOptions}
            />
          )}
        </StepSection>
      )}

      {stepName === 'Phases' && (
        <StepSection
          title="Which phases does the work split into?"
          help="Optional. General is always there for time that fits no phase."
        >
          <ChoiceGroup
            multi
            ariaLabel="Phases"
            cols={3}
            value={tasks.map((task) => task.id)}
            onChange={togglePhase}
            options={phaseList.map((task) => {
              const logged = initial ? phaseHours(initial, task.id) : 0;
              return {
                value: task.id,
                label: task.name,
                sub: isGeneralTask(task)
                  ? 'Always on'
                  : logged > 0
                    ? `${fmt(logged)}h logged`
                    : undefined,
                disabled: isGeneralTask(task),
              };
            })}
          />
          {pendingRemoval && (
            <StepNote tone="warn">
              Removing {pendingRemoval.name} also removes its{' '}
              {fmt(phaseHours(initial, pendingRemoval.id))}h of logged time.{' '}
              <button
                type="button"
                className="link"
                onClick={() => setPendingRemoval(null)}
              >
                Keep it
              </button>{' '}
              ·{' '}
              <button
                type="button"
                className="link danger"
                onClick={() => {
                  set({
                    tasks: tasks.filter(
                      (task) => task.id !== pendingRemoval.id,
                    ),
                  });
                  setPendingRemoval(null);
                }}
              >
                Remove phase and time
              </button>
            </StepNote>
          )}
          <BigField
            id="project-new-phase"
            label="Add a phase"
            placeholder="e.g. Training"
            unit="Enter to add"
            value={newPhase}
            error={phaseError || undefined}
            onChange={(event) => {
              setNewPhase(event.target.value);
              setPhaseError('');
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              addPhase();
            }}
            onBlur={addPhase}
            autoFocus={
              !!focusPhase &&
              focusPhase !== BUDGET_FOCUS &&
              focusPhase !== PROJECTWORKS_FOCUS
            }
          />
        </StepSection>
      )}

      {stepName === 'Budget' && (
        <StepSection
          title="What is the budget?"
          help="Optional. Leave it blank to track hours only."
        >
          <div className="cfg-pair">
            <BigField
              id="project-budget"
              label="Total budget"
              prefix="$"
              unit="AUD"
              inputMode="decimal"
              placeholder="No budget"
              value={draft.finance.budget}
              error={errors.budget}
              hint={
                budget != null && rate > 0
                  ? formatEffort(budget, rate, perDay)
                  : null
              }
              onChange={(event) => setFinance({ budget: event.target.value })}
              autoFocus={focusPhase === BUDGET_FOCUS}
            />
            <BigField
              id="project-rate"
              label="Hourly rate"
              prefix="$"
              unit="/ h"
              inputMode="decimal"
              placeholder={
                hourlyRate == null
                  ? 'Not set'
                  : `${hourlyRate} (${roleName || 'workspace'})`
              }
              value={draft.finance.hourlyRate ?? ''}
              error={errors.hourlyRate}
              hint={
                roleName
                  ? 'Blank uses your role’s rate'
                  : 'Blank uses the workspace rate'
              }
              onChange={(event) =>
                setFinance({ hourlyRate: event.target.value })
              }
            />
          </div>
          {budget != null && phases.length > 0 && (
            <ul className="cfg-rows">
              {phases.map((task) => (
                <li key={task.id}>
                  <BigField
                    id={`phase-budget-${task.id}`}
                    label={`${task.name} budget`}
                    prefix="$"
                    inputMode="decimal"
                    placeholder="0"
                    value={draft.finance.phaseBudgets[task.id] ?? ''}
                    error={errors[`phase:${task.id}`]}
                    hint="Required"
                    onChange={(event) =>
                      setFinance({
                        phaseBudgets: {
                          ...draft.finance.phaseBudgets,
                          [task.id]: event.target.value,
                        },
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          {budget != null && (
            <RemainderRow
              label="General budget"
              value={formatMoney(fromCents(toCents(budget) - phaseBudgetCents))}
              over={phaseBudgetCents > toCents(budget)}
            />
          )}
          {errors.phases && (
            <p className="field-error" role="alert">
              {errors.phases}
            </p>
          )}
        </StepSection>
      )}

      {stepName === 'Costings' && (
        <StepSection
          title="What are the costed activities?"
          help="Optional. Logged time is matched to these from your entry notes."
        >
          <ChoiceGroup
            label="Enter amounts in"
            cols={2}
            value={inDays ? 'days' : '$'}
            onChange={setUnit}
            options={[
              { value: '$', label: 'Dollars' },
              {
                value: 'days',
                label: 'Days',
                sub:
                  rate > 0
                    ? `${perDay}h at ${formatMoney(rate)}/h`
                    : 'Set an hourly rate first',
                disabled: !(rate > 0),
              },
            ]}
          />
          {draft.finance.activities.map((activity, index) => {
            const tagged = tagCounts[activity.id] || 0;
            const dollars = dollarsOf(activity);
            return (
              <div className="cfg-costing" key={activity.id}>
                <BigField
                  id={`activity-name-${activity.id}`}
                  label="Activity"
                  placeholder={
                    index === draft.finance.activities.length - 1
                      ? 'Add another activity'
                      : 'Activity name'
                  }
                  value={activity.name}
                  error={errors[`activity:${activity.id}`]}
                  hint={
                    tagged
                      ? `${tagged} tagged ${tagged === 1 ? 'entry' : 'entries'}`
                      : null
                  }
                  onChange={(event) =>
                    setActivity(activity.id, { name: event.target.value })
                  }
                />
                <BigField
                  id={`activity-amount-${activity.id}`}
                  label="Amount"
                  prefix={activity.unit === 'days' ? null : '$'}
                  unit={activity.unit === 'days' ? 'days' : null}
                  inputMode="decimal"
                  placeholder="0"
                  value={activity.amount}
                  hint={
                    dollars == null
                      ? null
                      : activity.unit === 'days'
                        ? `= ${formatMoney(dollars)}`
                        : rate > 0
                          ? formatEffort(dollars, rate, perDay)
                          : null
                  }
                  onChange={(event) =>
                    setActivity(activity.id, { amount: event.target.value })
                  }
                />
                <BigField
                  id={`activity-aliases-${activity.id}`}
                  label="Also matches"
                  placeholder="Optional, comma separated"
                  value={activity.aliases}
                  onChange={(event) =>
                    setActivity(activity.id, { aliases: event.target.value })
                  }
                />
                {rateLevels.length > 0 &&
                  (activity.name || activity.amount) && (
                    <ChoiceGroup
                      label="Costed at"
                      ariaLabel={`${activity.name || 'Activity'} costed at`}
                      value={
                        rateLevels.some(
                          (level) => level.id === activity.levelId,
                        )
                          ? activity.levelId
                          : ''
                      }
                      onChange={(levelId) =>
                        setActivity(activity.id, { levelId })
                      }
                      options={[
                        { value: '', label: 'Not set' },
                        ...rateLevels.map((level) => ({
                          value: level.id,
                          label: level.name,
                        })),
                      ]}
                    />
                  )}
              </div>
            );
          })}
          {budget != null && (
            <RemainderRow
              label="Unallocated"
              value={
                inDays && rate > 0
                  ? `${fmt((toCents(budget) - costingCents) / 100 / (rate * perDay))} days`
                  : formatMoney(fromCents(toCents(budget) - costingCents))
              }
              over={costingCents > toCents(budget)}
            />
          )}
          {financeResult.warnings
            .filter((warning) => warning.startsWith('Costed'))
            .map((warning) => (
              <StepNote tone="warn" key={warning}>
                {warning}
              </StepNote>
            ))}
        </StepSection>
      )}

      {stepName === 'Check' && (
        <StepSection title={initial ? 'Check and save' : 'Check and create'}>
          <ReviewList
            rows={[
              [
                'Project',
                [draft.name.trim(), draft.client.trim()]
                  .filter(Boolean)
                  .join(' · '),
              ],
              ...(projectworks.value
                ? [['Projectworks', projectworks.value]]
                : []),
              ['Type', oneTime ? `One-time · ${durationText}` : 'Standard'],
              [
                'Hours',
                draft.unlimited
                  ? 'Unlimited'
                  : `${fmt(Number(draft.hours))}h a week${
                      showSchedule
                        ? `, ${scopeOptions.find((option) => option.value === applyScope)?.label.toLowerCase()}`
                        : ''
                    }`,
              ],
              ['Phases', phaseLabel],
              [
                'Budget',
                budget == null
                  ? 'No budget'
                  : `${money(budget)}${rate ? ` at ${formatMoney(rate)}/h` : ''}`,
              ],
              ...(budget != null && phases.length
                ? [
                    [
                      'Phase budgets',
                      [
                        ...phases.map(
                          (task) =>
                            `${task.name} ${money(parseMoney(draft.finance.phaseBudgets[task.id]).value || 0)}`,
                        ),
                        `General ${money(fromCents(toCents(budget) - phaseBudgetCents))}`,
                      ].join(' · '),
                    ],
                  ]
                : []),
              [
                'Costings',
                financeResult.value.activities.length
                  ? financeResult.value.activities
                      .map(
                        (activity) =>
                          `${activity.name} ${money(activity.amount || 0)}`,
                      )
                      .join(' · ')
                  : 'None',
              ],
            ]}
          />
          {Object.keys(allErrors).length > 0 && (
            <p className="field-error" role="alert">
              Something needs fixing. Use Back to correct it.
            </p>
          )}
        </StepSection>
      )}
    </StepDialog>
  );
}
