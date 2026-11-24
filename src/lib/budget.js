// Budgets, costings and financials. Everything here is a pure function of the
// workspace, so undo/redo, file reloads and edits recalculate for free.
//
// Money is handled in integer cents internally so totals never drift
// (each entry is costed once, rounded to the cent, then summed).
import {
  EPSILON,
  isVisible,
  monthlyPlan,
  projectMetrics,
  shiftWeek,
} from './utils.js';
import { isGeneralTask, phasesOf } from './tasks.js';
import {
  GENERAL_NOTE_ID,
  NO_ACTIVITY_TAG,
  entryActivityTag,
  entryNote,
} from './entryNotes.js';
import { matchActivity } from './activityMatch.js';

export const MONEY_MAX = 1_000_000_000;
export const RATE_MAX = 100_000;
// Spending at or past this share of a budget turns it amber.
export const BUDGET_NEAR = 0.75;
// Activities turn amber a little later, at 80% of their costing.
export const ACTIVITY_NEAR = 0.8;
// Open-ended projects are forecast over this many weeks.
export const FORECAST_HORIZON_WEEKS = 12;
// Burn rate is the average logged cost over this many weeks.
export const BURN_WINDOW_WEEKS = 4;
// Logging this much more than the plan raises the "billing a lot" warning.
export const HIGH_BURN_FACTOR = 1.2;
// Weeks shown in the cumulative spend sparkline.
export const SERIES_WEEKS = 8;

const WEEK_KEY = /^\d{4}-\d{2}-\d{2}$/;
const isPlainObject = (value) =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const toCents = (dollars) =>
  Math.round(Number((Number(dollars) * 100).toFixed(4)));
export const fromCents = (cents) => cents / 100;
export const roundMoney = (dollars) => fromCents(toCents(dollars));

const formatters = new Map();
const formatter = (digits) => {
  if (!formatters.has(digits))
    formatters.set(
      digits,
      new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }),
    );
  return formatters.get(digits);
};
// "$4,000" for whole dollars, "$4,000.50" otherwise; null shows as an em dash.
export function formatMoney(dollars, { whole = false } = {}) {
  if (dollars == null || !Number.isFinite(Number(dollars))) return '—';
  const cents = toCents(dollars);
  return formatter(whole || cents % 100 === 0 ? 0 : 2)
    .format(whole ? Math.round(cents / 100) : cents / 100)
    .replace(/^-/, '−');
}

// Parses a typed dollar amount. Blank means "not set".
export function parseMoney(value, { max = MONEY_MAX, label = 'Amount' } = {}) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { error: `${label} must be a number.` };
    if (value < 0) return { error: `${label} cannot be negative.` };
    if (value > max) return { error: `${label} is too large.` };
    return { value: roundMoney(value) };
  }
  const s = String(value ?? '')
    .trim()
    .replace(/^(aud|a\$|\$)\s*/i, '')
    .replace(/[,\s]/g, '');
  if (!s) return { value: null };
  if (/^-/.test(s)) return { error: `${label} cannot be negative.` };
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(s))
    return {
      error: `${label} must be a dollar amount like 4000 or 4,000.50.`,
    };
  const n = Number(s);
  if (!Number.isFinite(n)) return { error: `${label} must be a number.` };
  if (n > max) return { error: `${label} is too large.` };
  return { value: roundMoney(n) };
}

export const parseRate = (value) =>
  parseMoney(value, { max: RATE_MAX, label: 'Hourly rate' });

// Stored amounts: a finite, non-negative number rounded to cents, else null.
export function normaliseMoney(raw, max = MONEY_MAX) {
  if (raw == null || raw === '') return null;
  const parsed = parseMoney(typeof raw === 'string' ? raw : Number(raw), {
    max,
  });
  return parsed.error ? null : parsed.value;
}

export const hourlyRateOf = (settings) =>
  normaliseMoney(settings?.hourlyRate, RATE_MAX);

// Settings fields owned by financials, for migrateBackup.
export function normaliseFinanceSettings(settings) {
  if (!isPlainObject(settings) || !('hourlyRate' in settings)) return {};
  return { hourlyRate: hourlyRateOf(settings) };
}

const nonGeneralTaskIds = (project) =>
  new Set(phasesOf(project).map((task) => task.id));

export function normaliseActivities(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.flatMap((item, index) => {
    if (!isPlainObject(item)) return [];
    const name = String(item.name ?? '').trim();
    if (!name) return [];
    let id = String(item.id ?? '').trim() || `activity-${index + 1}`;
    if (id === NO_ACTIVITY_TAG || seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    const aliases = (
      Array.isArray(item.aliases)
        ? item.aliases
        : typeof item.aliases === 'string'
          ? item.aliases.split(',')
          : []
    )
      .map((alias) => String(alias ?? '').trim())
      .filter(Boolean);
    return [
      {
        id,
        name,
        amount: normaliseMoney(item.amount),
        ...(aliases.length ? { aliases: [...new Set(aliases)] } : {}),
      },
    ];
  });
}

const entryHoursAt = (project, taskId, week, day) =>
  Number(
    (taskId === GENERAL_NOTE_ID
      ? project.entries?.[week]?.[day]
      : project.taskEntries?.[taskId]?.[week]?.[day]) || 0,
  );

// Validates the financial fields of one project. Fields that were never set
// stay absent so older workspaces are not rewritten on load.
export function normaliseProjectFinance(project) {
  if (!isPlainObject(project)) return project;
  const next = { ...project },
    phaseIds = nonGeneralTaskIds(project);
  if ('budget' in project) next.budget = normaliseMoney(project.budget);
  if ('phaseBudgets' in project)
    next.phaseBudgets = Object.fromEntries(
      Object.entries(
        isPlainObject(project.phaseBudgets) ? project.phaseBudgets : {},
      ).flatMap(([taskId, amount]) => {
        const value = normaliseMoney(amount);
        return phaseIds.has(taskId) && value != null ? [[taskId, value]] : [];
      }),
    );
  if ('activities' in project)
    next.activities = normaliseActivities(project.activities);
  if ('activityTags' in project) {
    const activityIds = new Set((next.activities || []).map((a) => a.id)),
      tags = {};
    for (const [taskId, weeks] of Object.entries(
      isPlainObject(project.activityTags) ? project.activityTags : {},
    )) {
      if (taskId !== GENERAL_NOTE_ID && !phaseIds.has(taskId)) continue;
      for (const [week, days] of Object.entries(
        isPlainObject(weeks) ? weeks : {},
      )) {
        if (!WEEK_KEY.test(week)) continue;
        for (const [day, activityId] of Object.entries(
          isPlainObject(days) ? days : {},
        )) {
          const index = Number(day);
          if (
            !Number.isInteger(index) ||
            index < 0 ||
            index > 6 ||
            !(activityId === NO_ACTIVITY_TAG || activityIds.has(activityId)) ||
            entryHoursAt(project, taskId, week, index) <= 0
          )
            continue;
          ((tags[taskId] ||= {})[week] ||= {})[index] = activityId;
        }
      }
    }
    next.activityTags = tags;
  }
  return next;
}

// Applies the project editor's financial draft and prunes anything that no
// longer exists (removed phases, deleted activities and their tags).
export function applyProjectFinance(project, finance) {
  if (!finance) return normaliseProjectFinance(project);
  return normaliseProjectFinance({
    ...project,
    budget: finance.budget ?? null,
    phaseBudgets: finance.phaseBudgets || {},
    activities: finance.activities || [],
    activityTags: project.activityTags || {},
  });
}

// Validation for the project editor. Returns { errors, warnings, value }.
export function validateFinanceDraft(draft, tasks = []) {
  const errors = {},
    warnings = [],
    budget = parseMoney(draft.budget, { label: 'Budget' });
  if (budget.error) errors.budget = budget.error;
  const phaseIds = new Set(
    tasks.filter((task) => !isGeneralTask(task)).map((task) => task.id),
  );
  const phaseBudgets = {};
  for (const [taskId, raw] of Object.entries(draft.phaseBudgets || {})) {
    if (!phaseIds.has(taskId)) continue;
    const parsed = parseMoney(raw, { label: 'Phase budget' });
    if (parsed.error) errors[`phase:${taskId}`] = parsed.error;
    else if (parsed.value != null) phaseBudgets[taskId] = parsed.value;
  }
  const activities = [],
    names = new Set();
  (draft.activities || []).forEach((activity) => {
    const name = String(activity.name ?? '').trim(),
      parsed = parseMoney(activity.amount, { label: 'Costing' });
    if (!name && (activity.amount === '' || activity.amount == null)) return;
    if (!name) errors[`activity:${activity.id}`] = 'Name this activity.';
    else if (names.has(name.toLowerCase()))
      errors[`activity:${activity.id}`] = 'Each activity needs a unique name.';
    else if (parsed.error) errors[`activity:${activity.id}`] = parsed.error;
    names.add(name.toLowerCase());
    activities.push({ ...activity, name, amount: parsed.value ?? null });
  });
  const bucketCents = Object.values(phaseBudgets).reduce(
    (sum, value) => sum + toCents(value),
    0,
  );
  if (budget.value != null && bucketCents > toCents(budget.value))
    warnings.push(
      `Phase budgets add up to ${formatMoney(fromCents(bucketCents))}, more than the ${formatMoney(budget.value)} project budget.`,
    );
  const costingCents = activities.reduce(
    (sum, activity) => sum + toCents(activity.amount || 0),
    0,
  );
  if (budget.value != null && costingCents > toCents(budget.value))
    warnings.push(
      `Costed activities add up to ${formatMoney(fromCents(costingCents))}, more than the project budget.`,
    );
  return {
    errors,
    warnings,
    value: {
      budget: budget.value ?? null,
      phaseBudgets,
      activities: normaliseActivities(activities),
    },
  };
}

// Every costed time entry of a project. Leave days are excluded unless asked,
// matching the timesheet totals; orphaned phase time is ignored.
export function projectEntries(project, { leaveWeeks = {}, includeLeave = false } = {}) {
  const sources = [
    {
      taskId: GENERAL_NOTE_ID,
      name: 'General',
      weeks: project.entries || {},
    },
    ...phasesOf(project).map((task) => ({
      taskId: task.id,
      name: task.name,
      weeks: project.taskEntries?.[task.id] || {},
    })),
  ];
  const list = [];
  for (const source of sources)
    for (const [week, days] of Object.entries(source.weeks || {}))
      for (const [day, raw] of Object.entries(days || {})) {
        const hours = Number(raw),
          index = Number(day);
        if (!Number.isFinite(hours) || hours <= 0) continue;
        const onLeave = (leaveWeeks?.[week] || []).includes(index);
        if (onLeave && !includeLeave) continue;
        list.push({
          taskId: source.taskId,
          taskName: source.name,
          week,
          day: index,
          hours,
          onLeave,
        });
      }
  return list;
}

const entryCents = (hours, rate) => (rate == null ? 0 : toCents(hours * rate));

// Which costed activity an entry draws from. An explicit tag wins, the
// "not costed" tag opts out, otherwise the note is matched automatically.
export function entryActivity(project, taskId, week, day, cache) {
  const activities = project.activities || [];
  if (!activities.length)
    return { activityId: null, source: null, status: 'no-activities' };
  const tag = entryActivityTag(project, taskId, week, day);
  if (tag === NO_ACTIVITY_TAG)
    return { activityId: null, source: 'tag', status: 'excluded' };
  if (tag && activities.some((activity) => activity.id === tag))
    return { activityId: tag, source: 'tag', status: 'tagged' };
  const note = entryNote(project, taskId, week, day);
  if (!note.trim())
    return { activityId: null, source: null, status: 'no-note', candidates: [] };
  let match = cache?.get(note);
  if (!match) {
    match = matchActivity(note, activities);
    cache?.set(note, match);
  }
  return match.status === 'match'
    ? {
        activityId: match.activityId,
        source: 'auto',
        status: 'match',
        candidates: match.candidates,
        note,
      }
    : {
        activityId: null,
        source: null,
        status: match.status,
        candidates: match.candidates || [],
        note,
      };
}

const TONES = {
  none: 'neutral',
  under: 'green',
  near: 'amber',
  resourcing: 'yellow',
  soon: 'red',
  at: 'red',
  over: 'red',
};
export const statusTone = (level) => TONES[level] || 'neutral';

const pctOf = (cents, budgetCents) =>
  budgetCents > 0 ? cents / budgetCents : cents > 0 ? Infinity : 0;

// The full status scale for a budget. "Resourcing" (yellow) means the plan
// would overspend: it is informational and never outranks the user's own
// logged time reaching the budget (red).
export function budgetStatus({
  hasRate,
  budgetCents,
  spentCents,
  forecastCents = null,
  burnCents = 0,
  planWeekCents = 0,
  weekSpentCents = 0,
  near = BUDGET_NEAR,
}) {
  const flags = { resourcingOver: false, highBurn: false };
  if (!hasRate)
    return {
      level: 'none',
      tone: 'neutral',
      label: 'No rate',
      message: 'Set an hourly rate in Settings to cost logged time.',
      flags,
    };
  if (budgetCents == null)
    return {
      level: 'none',
      tone: 'neutral',
      label: 'No budget',
      message: 'Add a budget to this project to track spend.',
      flags,
    };
  const remaining = budgetCents - spentCents,
    pct = pctOf(spentCents, budgetCents);
  flags.resourcingOver = forecastCents != null && forecastCents > budgetCents;
  // Logging well above the plan (this week or on average) or, without a
  // plan, a burn that empties the budget within the burn window.
  flags.highBurn =
    remaining > 0 &&
    (planWeekCents > 0
      ? Math.max(burnCents, weekSpentCents) >
        planWeekCents * HIGH_BURN_FACTOR
      : burnCents > 0 && remaining / burnCents < BURN_WINDOW_WEEKS);
  const make = (level, label, message) => ({
    level,
    tone: statusTone(level),
    label,
    message,
    flags,
    pct,
  });
  if (budgetCents === 0 && spentCents === 0)
    return make('near', '$0 budget', 'This budget is $0, so any logged time goes over.');
  if (remaining < 0)
    return make(
      'over',
      'Over budget',
      `Your logged time is ${formatMoney(fromCents(-remaining))} over budget.`,
    );
  if (remaining === 0)
    return make('at', 'At budget', 'Your logged time has used the whole budget.');
  if (burnCents > 0 && burnCents >= remaining)
    return make(
      'soon',
      'Runs out this week',
      'At your current burn rate this budget runs out within a week.',
    );
  if (pct >= near)
    return make(
      'near',
      'Approaching',
      `${Math.round(pct * 100)}% of the budget is spent.`,
    );
  if (flags.resourcingOver)
    return make(
      'resourcing',
      'Plan exceeds budget',
      `The resourcing plan would spend ${formatMoney(fromCents(forecastCents - budgetCents))} more than the budget. That is a planning issue, not your logging.`,
    );
  return make('under', 'On track', `${Math.round(pct * 100)}% of the budget is spent.`);
}

// Activities use the same scale against their costing: under / near / at / over.
export function activityStatus({ hasRate, amountCents, spentCents }) {
  return budgetStatus({
    hasRate,
    budgetCents: amountCents,
    spentCents,
    near: ACTIVITY_NEAR,
  });
}

// Planned hours for one week, falling back to a weekly share of a monthly plan.
function plannedWeekHours(project, week, leaveWeeks) {
  const allowance = projectMetrics(project, week, leaveWeeks).weeklyAllowance;
  if (allowance != null && Number.isFinite(Number(allowance)))
    return Math.max(0, Number(allowance));
  const monthly = monthlyPlan(project, week);
  if (monthly != null && Number.isFinite(Number(monthly)))
    return Math.max(0, (Number(monthly) * 12) / 52);
  return null;
}

// Resourced plan still ahead, from the reference week to the project's end
// (or a rolling horizon for open-ended projects). Frontloaded hours move
// allowance between weeks, so using each week's net allowance never counts
// them twice; this week only counts what is left after logged time.
export function resourcingForecast(project, week, leaveWeeks = {}) {
  const closed = project.archived || project.status === 'closed';
  const end =
    project.hiddenOnwardsFrom ||
    shiftWeek(week, FORECAST_HORIZON_WEEKS);
  const result = {
    hours: 0,
    weeks: 0,
    end,
    openEnded: !project.hiddenOnwardsFrom,
    planKnown: false,
    thisWeekHours: null,
  };
  if (closed) return { ...result, planKnown: true };
  for (let key = week, guard = 0; key < end && guard < 260; guard++) {
    if (isVisible(project, key)) {
      const planned = plannedWeekHours(project, key, leaveWeeks);
      if (planned != null) {
        result.planKnown = true;
        const left =
          key === week
            ? Math.max(
                0,
                planned - projectMetrics(project, key, leaveWeeks).logged,
              )
            : planned;
        if (key === week) result.thisWeekHours = planned;
        result.hours += left;
        result.weeks += 1;
      }
    }
    key = shiftWeek(key, 1);
  }
  return result;
}

// Everything the financials screen needs for one project.
export function projectFinance(project, settings = {}, week, options = {}) {
  const rate = hourlyRateOf(settings),
    hasRate = rate != null,
    leaveWeeks = settings.leaveWeeks || {},
    budget = normaliseMoney(project.budget),
    budgetCents = budget == null ? null : toCents(budget),
    phaseBudgets = isPlainObject(project.phaseBudgets) ? project.phaseBudgets : {},
    activities = normaliseActivities(project.activities),
    withActivities = { ...project, activities },
    cache = new Map();
  const entries = projectEntries(project, { leaveWeeks }).map((entry) => ({
    ...entry,
    cents: entryCents(entry.hours, rate),
    activity: entryActivity(withActivities, entry.taskId, entry.week, entry.day, cache),
  }));
  const leaveHours = projectEntries(project, { leaveWeeks, includeLeave: true })
    .filter((entry) => entry.onLeave)
    .reduce((sum, entry) => sum + entry.hours, 0);
  const sum = (list, key) => list.reduce((n, item) => n + item[key], 0);
  const spentCents = sum(entries, 'cents'),
    hours = sum(entries, 'hours');

  // Phase buckets: budgeted phases draw from their own bucket; General and
  // phases without a bucket share the unallocated rest of the budget.
  const phases = phasesOf(project);
  const bucketed = phases.filter(
    (task) => normaliseMoney(phaseBudgets[task.id]) != null,
  );
  const bucketCents = bucketed.reduce(
    (n, task) => n + toCents(normaliseMoney(phaseBudgets[task.id])),
    0,
  );
  const buckets = bucketed.map((task) => {
    const list = entries.filter((entry) => entry.taskId === task.id),
      cents = sum(list, 'cents'),
      amountCents = toCents(normaliseMoney(phaseBudgets[task.id]));
    return {
      id: task.id,
      name: task.name,
      budget: fromCents(amountCents),
      hours: sum(list, 'hours'),
      spent: fromCents(cents),
      remaining: fromCents(amountCents - cents),
      pct: pctOf(cents, amountCents),
      status: budgetStatus({ hasRate, budgetCents: amountCents, spentCents: cents }),
    };
  });
  const bucketIds = new Set(bucketed.map((task) => task.id));
  const generalList = entries.filter((entry) => !bucketIds.has(entry.taskId)),
    generalCents = sum(generalList, 'cents'),
    unallocatedCents =
      budgetCents == null ? null : Math.max(0, budgetCents - bucketCents);
  const general = {
    id: GENERAL_NOTE_ID,
    name: bucketed.length ? 'General & unbudgeted phases' : 'General',
    budget: unallocatedCents == null ? null : fromCents(unallocatedCents),
    hours: sum(generalList, 'hours'),
    spent: fromCents(generalCents),
    remaining:
      unallocatedCents == null ? null : fromCents(unallocatedCents - generalCents),
    pct: unallocatedCents == null ? null : pctOf(generalCents, unallocatedCents),
    status: budgetStatus({
      hasRate,
      budgetCents: unallocatedCents,
      spentCents: generalCents,
    }),
  };

  // Activities draw from tagged or confidently matched entries.
  const activityRows = activities.map((activity) => {
    const list = entries.filter((entry) => entry.activity.activityId === activity.id),
      cents = sum(list, 'cents'),
      amountCents = activity.amount == null ? null : toCents(activity.amount);
    return {
      ...activity,
      entries: list.length,
      hours: sum(list, 'hours'),
      spent: fromCents(cents),
      remaining: amountCents == null ? null : fromCents(amountCents - cents),
      variance: amountCents == null ? null : fromCents(amountCents - cents),
      pct: amountCents == null ? null : pctOf(cents, amountCents),
      status: activityStatus({ hasRate, amountCents, spentCents: cents }),
    };
  });
  const unlinked = activities.length
    ? entries.filter((entry) => !entry.activity.activityId)
    : [];
  const review = unlinked
    .filter((entry) => entry.activity.source !== 'tag')
    .map((entry) => ({
      projectId: project.id,
      projectName: project.name,
      taskId: entry.taskId,
      taskName: entry.taskName,
      week: entry.week,
      day: entry.day,
      hours: entry.hours,
      cost: fromCents(entry.cents),
      note: entryNote(project, entry.taskId, entry.week, entry.day),
      status: entry.activity.status,
      candidates: entry.activity.candidates || [],
    }))
    .sort((a, b) => b.week.localeCompare(a.week) || b.day - a.day);

  // Forecast and burn.
  const ref = week || options.week;
  const forecast = ref
    ? resourcingForecast(project, ref, leaveWeeks)
    : { hours: 0, weeks: 0, planKnown: false, thisWeekHours: null };
  const remainingPlanCents = entryCents(forecast.hours, rate),
    forecastCents = spentCents + remainingPlanCents;
  let burnCents = 0,
    weekSpentCents = 0;
  if (ref) {
    weekSpentCents = sum(
      entries.filter((entry) => entry.week === ref),
      'cents',
    );
    const window = new Set(
      Array.from({ length: BURN_WINDOW_WEEKS }, (_, i) => shiftWeek(ref, -i)),
    );
    burnCents = Math.round(
      sum(
        entries.filter((entry) => window.has(entry.week)),
        'cents',
      ) / BURN_WINDOW_WEEKS,
    );
  }
  const planWeekCents = entryCents(forecast.thisWeekHours || 0, rate);
  const status = budgetStatus({
    hasRate,
    budgetCents,
    spentCents,
    forecastCents: forecast.planKnown ? forecastCents : null,
    burnCents,
    planWeekCents,
    weekSpentCents,
  });
  const remainingCents = budgetCents == null ? null : budgetCents - spentCents;
  // Cost by timesheet line (General and each phase), for stacked bars.
  const byPhase = [
    { id: GENERAL_NOTE_ID, name: 'General' },
    ...phases.map((task) => ({ id: task.id, name: task.name })),
  ].map((line) => {
    const list = entries.filter((entry) => entry.taskId === line.id);
    return { ...line, hours: sum(list, 'hours'), spent: fromCents(sum(list, 'cents')) };
  });
  // Cumulative spend at the end of each of the last SERIES_WEEKS weeks.
  const series = [];
  if (ref)
    for (let i = SERIES_WEEKS - 1; i >= 0; i--) {
      const key = shiftWeek(ref, -i);
      series.push({
        week: key,
        spent: fromCents(
          sum(
            entries.filter((entry) => entry.week <= key),
            'cents',
          ),
        ),
        weekSpent: fromCents(
          sum(
            entries.filter((entry) => entry.week === key),
            'cents',
          ),
        ),
      });
    }
  return {
    byPhase,
    series,
    id: project.id,
    name: project.name,
    client: project.client || '',
    color: project.color,
    archived: !!project.archived,
    rate,
    hasRate,
    budget,
    hasBudget: budget != null,
    hours,
    leaveHours,
    spent: fromCents(spentCents),
    remaining: remainingCents == null ? null : fromCents(remainingCents),
    pct: budgetCents == null ? null : pctOf(spentCents, budgetCents),
    phases: [general, ...buckets],
    bucketsTotal: fromCents(bucketCents),
    bucketsExceedBudget: budgetCents != null && bucketCents > budgetCents,
    activities: activityRows,
    costingTotal: fromCents(
      activities.reduce((n, a) => n + toCents(a.amount || 0), 0),
    ),
    unlinked: {
      entries: unlinked.length,
      hours: sum(unlinked, 'hours'),
      spent: fromCents(sum(unlinked, 'cents')),
    },
    review,
    forecast: {
      ...forecast,
      remainingCost: fromCents(remainingPlanCents),
      total: fromCents(forecastCents),
      overBy:
        budgetCents == null || !forecast.planKnown
          ? null
          : fromCents(Math.max(0, forecastCents - budgetCents)),
    },
    burn: {
      weekly: fromCents(burnCents),
      runwayWeeks:
        remainingCents == null || burnCents <= 0
          ? null
          : Math.max(0, remainingCents / burnCents),
    },
    status,
    warning: status.flags.highBurn
      ? "You're billing a lot of time — this budget may be suffering."
      : null,
  };
}

// Cost of one week laid out like the timesheet: one row per General/phase
// line (or per activity), one cell per day, in cents-accurate dollars.
export function weekCostRows(project, settings = {}, week, { by = 'phase' } = {}) {
  const rate = hourlyRateOf(settings),
    leave = settings.leaveWeeks?.[week] || [],
    activities = normaliseActivities(project.activities),
    withActivities = { ...project, activities },
    cache = new Map();
  const entries = projectEntries(project, { includeLeave: true })
    .filter((entry) => entry.week === week)
    .map((entry) => ({
      ...entry,
      onLeave: leave.includes(entry.day),
      cents: leave.includes(entry.day) ? 0 : entryCents(entry.hours, rate),
    }));
  const rows = new Map();
  const rowFor = (id, name) => {
    if (!rows.has(id))
      rows.set(id, { id, name, days: {}, hours: 0, cents: 0 });
    return rows.get(id);
  };
  if (by === 'activity')
    activities.forEach((activity) => rowFor(activity.id, activity.name));
  else {
    rowFor(GENERAL_NOTE_ID, 'General');
    phasesOf(project).forEach((task) => rowFor(task.id, task.name));
  }
  for (const entry of entries) {
    let row;
    if (by === 'activity') {
      const { activityId } = entryActivity(
        withActivities,
        entry.taskId,
        entry.week,
        entry.day,
        cache,
      );
      row = activityId
        ? rowFor(activityId, '')
        : rowFor('__unlinked', 'Not linked to an activity');
    } else row = rowFor(entry.taskId, entry.taskName);
    const cell = (row.days[entry.day] ||= { hours: 0, cents: 0, onLeave: false });
    cell.hours += entry.hours;
    cell.cents += entry.cents;
    cell.onLeave ||= entry.onLeave;
    if (!entry.onLeave) {
      row.hours += entry.hours;
      row.cents += entry.cents;
    }
  }
  const list = [...rows.values()].map((row) => ({
    ...row,
    cost: fromCents(row.cents),
    days: Object.fromEntries(
      Object.entries(row.days).map(([day, cell]) => [
        day,
        { ...cell, cost: fromCents(cell.cents) },
      ]),
    ),
  }));
  // Keep General first; drop empty phase/activity rows except General.
  return list.filter(
    (row) => row.id === GENERAL_NOTE_ID || row.hours > EPSILON || Object.keys(row.days).length,
  );
}

// Portfolio view for the financials screen.
export function financialsOverview(projects, settings = {}, week, { includeArchived = false } = {}) {
  const list = projects
    .filter((project) => includeArchived || !project.archived)
    .map((project) => projectFinance(project, settings, week));
  const total = (key) =>
    fromCents(list.reduce((n, item) => n + toCents(item[key] || 0), 0));
  const budgeted = list.filter((item) => item.hasBudget);
  return {
    rate: hourlyRateOf(settings),
    hasRate: hourlyRateOf(settings) != null,
    projects: list,
    budgeted: budgeted.length,
    totals: {
      budget: fromCents(budgeted.reduce((n, item) => n + toCents(item.budget), 0)),
      spent: total('spent'),
      budgetedSpent: fromCents(
        budgeted.reduce((n, item) => n + toCents(item.spent), 0),
      ),
      hours: list.reduce((n, item) => n + item.hours, 0),
    },
    review: list.flatMap((item) => item.review),
    counts: list.reduce((counts, item) => {
      counts[item.status.level] = (counts[item.status.level] || 0) + 1;
      return counts;
    }, {}),
  };
}

// Editable text draft of a project's financial fields for the project editor.
export function financeDraftOf(project) {
  const text = (value) => (value == null ? '' : String(value));
  return {
    budget: text(normaliseMoney(project?.budget)),
    phaseBudgets: Object.fromEntries(
      Object.entries(
        isPlainObject(project?.phaseBudgets) ? project.phaseBudgets : {},
      ).map(([taskId, value]) => [taskId, text(normaliseMoney(value))]),
    ),
    activities: normaliseActivities(project?.activities).map((activity) => ({
      id: activity.id,
      name: activity.name,
      amount: text(activity.amount),
      aliases: (activity.aliases || []).join(', '),
    })),
  };
}

// How many entries are explicitly tagged to each activity (for the editor).
export function activityTagCounts(project) {
  const counts = {};
  for (const weeks of Object.values(project?.activityTags || {}))
    for (const days of Object.values(weeks || {}))
      for (const id of Object.values(days || {}))
        counts[id] = (counts[id] || 0) + 1;
  return counts;
}

export const formatPercent = (value) =>
  value == null
    ? '—'
    : value === Infinity
      ? 'over'
      : `${Math.round(value * 100)}%`;
