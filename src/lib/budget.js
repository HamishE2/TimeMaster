// Budgets, costings and financials. Everything here is a pure function of the
// workspace, so undo/redo, file reloads and edits recalculate for free.
//
// Money is handled in integer cents internally so totals never drift
// (each entry is costed once, rounded to the cent, then summed).
import {
  EPSILON,
  dateString,
  isVisible,
  monthlyPlan,
  projectMetrics,
  shiftWeek,
  uuid,
  weekKeyFor,
} from './utils.js';
import { isGeneralTask, phasesOf } from './tasks.js';
import {
  GENERAL_NOTE_ID,
  NO_ACTIVITY_TAG,
  entryActivityTag,
  entryNote,
} from './entryNotes.js';
import {
  GENERAL_BUCKET,
  normaliseSplit,
  resolveEntryActivities,
} from './activityMatch.js';

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
  // Whole dollars round half away from zero (−$1.50 is −$2, like $1.50 is
  // $2) and never show "−$0".
  const value = whole
    ? Math.sign(cents) * Math.round(Math.abs(cents) / 100) || 0
    : cents / 100 || 0;
  return formatter(whole || cents % 100 === 0 ? 0 : 2)
    .format(value)
    .replace(/^-/, '−');
}

// Remaining budget in whole dollars, worked out from the rounded budget and
// spend so the three figures shown side by side always add up.
export const wholeRemaining = (budget, spent) =>
  budget == null || spent == null
    ? null
    : Math.sign(budget) * Math.round(Math.abs(budget)) -
      Math.sign(spent) * Math.round(Math.abs(spent));

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
// Stored strings are rounded like stored numbers ("212.505" is $212.51);
// only typed input is held to two decimals. Booleans, arrays and objects are
// not amounts.
export function normaliseMoney(raw, max = MONEY_MAX) {
  if (raw == null || raw === '') return null;
  let value = raw;
  if (typeof raw === 'string') {
    const plain = raw
      .trim()
      .replace(/^(aud|a\$|\$)\s*/i, '')
      .replace(/[,\s]/g, '');
    if (/^(\d+(\.\d*)?|\.\d+)$/.test(plain)) value = Number(plain);
  } else if (typeof raw !== 'number') return null;
  const parsed = parseMoney(value, { max });
  return parsed.error ? null : parsed.value;
}

// A rate of $0 costs nothing and would show every budget as "On track 0%",
// so it means "no rate", the same as leaving it blank.
const positiveRate = (raw) => normaliseMoney(raw, RATE_MAX) || null;
export const hourlyRateOf = (settings) => positiveRate(settings?.hourlyRate);

// A project's own rate (people are priced at different levels on different
// quotes) falls back to the workspace rate.
export const projectRateOf = (project, settings) =>
  positiveRate(project?.hourlyRate) ?? hourlyRateOf(settings);

// Passed as the project editor's focus to open it at the Budget section.
export const BUDGET_FOCUS = '__budget';

export const DEFAULT_HOURS_PER_DAY = 7.6;
// Budgets are sold in consultant days: hours per day is the average non-zero
// capacity of the working days, falling back to 7.6.
export function hoursPerDay(settings) {
  const caps = Array.isArray(settings?.capacityByDay)
      ? settings.capacityByDay
      : [],
    days = Array.isArray(settings?.visibleDays)
      ? settings.visibleDays
      : [0, 1, 2, 3, 4],
    values = days
      .map((day) => Number(caps[day]))
      .filter((value) => Number.isFinite(value) && value > 0);
  return values.length
    ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) /
        100
    : DEFAULT_HOURS_PER_DAY;
}

// Dollars as consultant effort at a rate: { hours, days } or null.
export function effortFor(dollars, rate, perDay = DEFAULT_HOURS_PER_DAY) {
  const amount = Number(dollars);
  if (!(rate > 0) || dollars == null || !Number.isFinite(amount)) return null;
  const hours = amount / rate;
  return { hours, days: hours / (perDay > 0 ? perDay : DEFAULT_HOURS_PER_DAY) };
}

const oneDecimal = (n) => {
  const v = Math.round(n * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};
// "≈1.4 days · 10.5h"; empty when there is no rate.
export function formatEffort(dollars, rate, perDay) {
  const effort = effortFor(dollars, rate, perDay);
  if (!effort) return '';
  const sign = effort.hours < 0 ? '−' : '',
    days = Math.abs(effort.days),
    hours = Math.abs(effort.hours);
  return `≈${sign}${oneDecimal(days)} ${oneDecimal(days) === '1' ? 'day' : 'days'} · ${sign}${oneDecimal(hours)}h`;
}

// Days of effort converted to dollars at a rate (stored as dollars).
export const daysToMoney = (days, rate, perDay = DEFAULT_HOURS_PER_DAY) =>
  rate == null ? null : roundMoney(Number(days) * perDay * rate);

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
  if ('hourlyRate' in project)
    next.hourlyRate = normaliseMoney(project.hourlyRate, RATE_MAX);
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
  if ('historicalUsage' in project)
    next.historicalUsage = normaliseHistoricalUsage(
      project.historicalUsage,
      project,
      next.activities ?? normaliseActivities(project.activities),
    );
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
          const hours = entryHoursAt(project, taskId, week, index);
          if (!Number.isInteger(index) || index < 0 || index > 6 || hours <= 0)
            continue;
          // A whole-entry tag for a deleted activity is dropped, so the
          // entry goes back to automatic matching on its note (as the editor
          // warns: "will become untagged"). A deleted share of a split goes
          // to the General bucket.
          const tag =
            typeof activityId === 'string'
              ? activityId === NO_ACTIVITY_TAG || activityIds.has(activityId)
                ? activityId
                : null
              : normaliseSplit(activityId, hours, next.activities || []);
          if (tag) ((tags[taskId] ||= {})[week] ||= {})[index] = tag;
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
    hourlyRate: finance.hourlyRate ?? null,
    phaseBudgets: finance.phaseBudgets || {},
    activities: finance.activities || [],
    activityTags: project.activityTags || {},
  });
}

// Typed days ("2.5", "1.25"): a non-negative number of days, any decimals.
function parseDays(value) {
  const s = String(value ?? '').trim();
  if (!s) return { value: null };
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s))
    return { error: 'Days must be a number, like 2.5.' };
  return { value: Number(s) };
}

// Validation for the project editor. Returns { errors, warnings, value }.
// Activity amounts may be typed in days (unit 'days'): they are converted to
// dollars with the project's rate × hours per day. With requirePhaseBudgets,
// a project with a total budget needs a budget for every phase (0 is fine)
// and the phases may not add up to more than the total: what is left is the
// General budget.
export function validateFinanceDraft(
  draft,
  tasks = [],
  {
    settingsRate = null,
    perDay = DEFAULT_HOURS_PER_DAY,
    requirePhaseBudgets = false,
  } = {},
) {
  const errors = {},
    warnings = [],
    budget = parseMoney(draft.budget, { label: 'Budget' }),
    ownRate = parseRate(draft.hourlyRate ?? ''),
    rate = ownRate.value ?? settingsRate;
  if (budget.error) errors.budget = budget.error;
  if (ownRate.error) errors.hourlyRate = ownRate.error;
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
  if (requirePhaseBudgets && budget.value != null)
    for (const task of tasks)
      if (
        phaseIds.has(task.id) &&
        phaseBudgets[task.id] == null &&
        !errors[`phase:${task.id}`]
      )
        errors[`phase:${task.id}`] = `Enter a budget for ${task.name}, or 0.`;
  const activities = [],
    names = new Set();
  (draft.activities || []).forEach((activity) => {
    const name = String(activity.name ?? '').trim(),
      inDays = activity.unit === 'days',
      typed = inDays
        ? parseDays(activity.amount)
        : parseMoney(activity.amount, { label: 'Costing' }),
      unchangedDays =
        inDays &&
        activity.fromDollars != null &&
        activity.amount === activity.daysText,
      parsed = unchangedDays
        ? parseMoney(activity.fromDollars, { label: 'Costing' })
        : inDays && !typed.error && typed.value != null
          ? rate == null
            ? { error: 'Set an hourly rate to enter days.' }
            : { value: daysToMoney(typed.value, rate, perDay) }
          : typed;
    if (!name && (activity.amount === '' || activity.amount == null)) return;
    if (!name) errors[`activity:${activity.id}`] = 'Name this activity.';
    else if (names.has(name.toLowerCase()))
      errors[`activity:${activity.id}`] = 'Each activity needs a unique name.';
    else if (parsed.error) errors[`activity:${activity.id}`] = parsed.error;
    names.add(name.toLowerCase());
    const stored = { ...activity, name, amount: parsed.value ?? null };
    delete stored.unit;
    delete stored.fromDollars;
    delete stored.daysText;
    activities.push(stored);
  });
  const bucketCents = Object.values(phaseBudgets).reduce(
    (sum, value) => sum + toCents(value),
    0,
  );
  if (budget.value != null && bucketCents > toCents(budget.value)) {
    const message = `Phase budgets add up to ${formatMoney(fromCents(bucketCents))}, more than the ${formatMoney(budget.value)} project budget.`;
    if (requirePhaseBudgets) errors.phases = message;
    else warnings.push(message);
  }
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
      hourlyRate: ownRate.value ?? null,
      phaseBudgets,
      activities: normaliseActivities(activities),
    },
  };
}

// Every costed time entry of a project. Leave days are excluded unless asked,
// matching the timesheet totals; orphaned phase time is ignored.
export function projectEntries(
  project,
  { leaveWeeks = {}, includeLeave = false } = {},
) {
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

// Which costed activities an entry draws from, as a split of its hours:
// { split: { activityId | GENERAL_BUCKET: hours }, source, status, parts }.
// A manual pick (one activity, General, or a stored split) wins; otherwise
// the note is matched, possibly to several activities, and anything left
// over is costed to the project's General bucket (source 'default').
export function entryActivity(project, taskId, week, day, cache, hours) {
  const activities = project.activities || [];
  if (!activities.length)
    return { split: {}, source: null, status: 'no-activities', parts: [] };
  const tag = entryActivityTag(project, taskId, week, day),
    note = entryNote(project, taskId, week, day),
    amount = hours ?? entryHoursAt(project, taskId, week, day);
  const key = tag ? null : `${amount}|${note}`;
  let result = key && cache?.get(key);
  if (!result) {
    result = resolveEntryActivities(note, activities, tag, amount);
    if (key) cache?.set(key, result);
  }
  return {
    ...result,
    // Nothing picked or matched: the hours sit in the General bucket.
    status: !tag && !note.trim() ? 'no-note' : result.status,
    note,
    tagKind: tagKind(tag),
  };
}

const tagKind = (tag) =>
  tag == null
    ? null
    : typeof tag === 'object'
      ? 'split'
      : tag === NO_ACTIVITY_TAG
        ? 'none'
        : 'activity';

// Splits an entry's cost in cents across its shares so the shares always add
// up to the entry's own cost (the rounding remainder goes to the largest).
function shareCents(split, hours, cents) {
  const keys = Object.keys(split);
  if (!keys.length || !(hours > 0)) return {};
  const out = {};
  let given = 0;
  for (const key of keys) {
    out[key] = Math.round((cents * split[key]) / hours);
    given += out[key];
  }
  const largest = keys.reduce((a, b) => (split[a] >= split[b] ? a : b));
  out[largest] += cents - given;
  return out;
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
      ? Math.max(burnCents, weekSpentCents) > planWeekCents * HIGH_BURN_FACTOR
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
    return make('near', '$0 budget', 'Any logged time goes over.');
  if (remaining < 0)
    return make(
      'over',
      'Over budget',
      `${formatMoney(fromCents(-remaining))} over budget.`,
    );
  if (remaining === 0) return make('at', 'At budget', 'Budget fully used.');
  if (burnCents > 0 && burnCents >= remaining)
    return make(
      'soon',
      'Runs out this week',
      'Runs out within a week at this pace.',
    );
  if (pct >= near)
    return make('near', 'Approaching', `${percentOf(pct)}% spent.`);
  if (flags.resourcingOver)
    return make(
      'resourcing',
      'Plan exceeds budget',
      `Plan goes ${formatMoney(fromCents(forecastCents - budgetCents))} over budget.`,
    );
  return make('under', 'On track', `${percentOf(pct)}% spent.`);
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
// them twice; each week only counts what is left after its logged time.
export function resourcingForecast(project, week, leaveWeeks = {}) {
  const closed = project.archived || project.status === 'closed';
  const end =
    project.hiddenOnwardsFrom || shiftWeek(week, FORECAST_HORIZON_WEEKS);
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
        // Logged time is already in the spend, so every week (this one and
        // any filled in ahead of time) only adds what its plan has left.
        const left = Math.max(
          0,
          planned - projectMetrics(project, key, leaveWeeks).logged,
        );
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
  const rate = projectRateOf(project, settings),
    hasRate = rate != null,
    leaveWeeks = settings.leaveWeeks || {},
    budget = normaliseMoney(project.budget),
    budgetCents = budget == null ? null : toCents(budget),
    phaseBudgets = isPlainObject(project.phaseBudgets)
      ? project.phaseBudgets
      : {},
    activities = normaliseActivities(project.activities),
    withActivities = { ...project, activities },
    cache = new Map();
  const logged = projectEntries(project, { leaveWeeks }).map((entry) => ({
    ...entry,
    cents: entryCents(entry.hours, rate),
    activity: entryActivity(
      withActivities,
      entry.taskId,
      entry.week,
      entry.day,
      cache,
      entry.hours,
    ),
  }));
  // Historical usage (work done before it was logged here) counts towards
  // spend, phase buckets and costings, but not burn, the week or the review.
  const history = historicalUsageParts(project, activities, rate);
  const entries = [...logged, ...history.entries];
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
      status: budgetStatus({
        hasRate,
        budgetCents: amountCents,
        spentCents: cents,
      }),
    };
  });
  const bucketIds = new Set(bucketed.map((task) => task.id));
  const generalList = entries.filter((entry) => !bucketIds.has(entry.taskId)),
    generalCents = sum(generalList, 'cents'),
    unallocatedCents =
      budgetCents == null ? null : Math.max(0, budgetCents - bucketCents);
  const general = {
    id: GENERAL_NOTE_ID,
    name:
      bucketed.length && bucketed.length < phases.length
        ? 'General & unbudgeted phases'
        : 'General',
    budget: unallocatedCents == null ? null : fromCents(unallocatedCents),
    hours: sum(generalList, 'hours'),
    spent: fromCents(generalCents),
    remaining:
      unallocatedCents == null
        ? null
        : fromCents(unallocatedCents - generalCents),
    pct:
      unallocatedCents == null ? null : pctOf(generalCents, unallocatedCents),
    status: budgetStatus({
      hasRate,
      budgetCents: unallocatedCents,
      spentCents: generalCents,
    }),
  };

  // Activities draw from their share of tagged or matched entries; a split
  // entry costs each share separately and never more than the entry itself.
  const activityIds = new Set(activities.map((activity) => activity.id));
  const shares = entries
    .flatMap((entry) => {
      const split = entry.activity.split || {},
        cents = shareCents(split, entry.hours, entry.cents);
      return Object.entries(split).map(([id, hours]) => ({
        entry,
        id,
        hours,
        cents: cents[id] || 0,
      }));
    })
    .concat(history.shares);
  const bySource = (list) =>
    list.reduce(
      (acc, share) => {
        const key =
          share.entry.activity.source === 'tag'
            ? 'picked'
            : share.entry.activity.source === 'auto'
              ? 'auto'
              : share.entry.activity.source === 'history'
                ? 'history'
                : 'default';
        acc[key] = Math.round((acc[key] + share.hours) * 100) / 100;
        return acc;
      },
      { picked: 0, auto: 0, default: 0, history: 0 },
    );
  const costingRow = (activity, list, amountCents) => {
    const cents = sum(list, 'cents');
    return {
      ...activity,
      entries: list.filter((share) => !share.entry.historical).length,
      historical: list.some((share) => share.entry.historical),
      hours: sum(list, 'hours'),
      bySource: bySource(list),
      spent: fromCents(cents),
      remaining: amountCents == null ? null : fromCents(amountCents - cents),
      variance: amountCents == null ? null : fromCents(amountCents - cents),
      pct: amountCents == null ? null : pctOf(cents, amountCents),
      status: activityStatus({ hasRate, amountCents, spentCents: cents }),
    };
  };
  const activityRows = activities.map((activity) =>
    costingRow(
      activity,
      shares.filter((share) => share.id === activity.id),
      activity.amount == null ? null : toCents(activity.amount),
    ),
  );
  // The General costing bucket: time not charged to a costed activity,
  // measured against the budget left after the costings.
  const costingCentsTotal = activities.reduce(
    (n, activity) => n + toCents(activity.amount || 0),
    0,
  );
  const generalCosting = activities.length
    ? costingRow(
        { id: GENERAL_BUCKET, name: 'General', amount: null },
        shares.filter((share) => !activityIds.has(share.id)),
        budgetCents == null
          ? null
          : Math.max(0, budgetCents - costingCentsTotal),
      )
    : null;
  if (generalCosting && budgetCents != null)
    generalCosting.amount = fromCents(
      Math.max(0, budgetCents - costingCentsTotal),
    );
  const linkedShares = shares.filter((share) => activityIds.has(share.id));
  const linkedHours = sum(linkedShares, 'hours'),
    linkedCents = sum(linkedShares, 'cents');
  // Worth a second look (never an error): a note that was too vague or fitted
  // several costings, or only partly matched, so time went to General.
  const reviewReason = (entry) => {
    const { source, status } = entry.activity;
    if (source === 'tag') return null;
    if (status === 'partial') return 'partial';
    if (source !== 'default') return null;
    if (status === 'vague' || status === 'ambiguous') return status;
    return status === 'no-note' ? 'no-note' : 'none';
  };
  const review = (activities.length ? logged : [])
    .map((entry) => ({ entry, reason: reviewReason(entry) }))
    .filter(({ reason }) => reason)
    .map(({ entry, reason }) => ({
      projectId: project.id,
      projectName: project.name,
      taskId: entry.taskId,
      taskName: entry.taskName,
      week: entry.week,
      day: entry.day,
      hours: entry.hours,
      cost: fromCents(entry.cents),
      hasRate,
      note: entryNote(project, entry.taskId, entry.week, entry.day),
      status: reason,
      // Vague, ambiguous and partial notes are listed by default; plain
      // General time (no note, or nothing like a costing) only on request.
      check: reason !== 'no-note' && reason !== 'none',
      split: entry.activity.split || {},
      parts: entry.activity.parts || [],
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
      logged.filter((entry) => entry.week === ref),
      'cents',
    );
    const window = new Set(
      Array.from({ length: BURN_WINDOW_WEEKS }, (_, i) => shiftWeek(ref, -i)),
    );
    burnCents = Math.round(
      sum(
        logged.filter((entry) => window.has(entry.week)),
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
    return {
      ...line,
      hours: sum(list, 'hours'),
      spent: fromCents(sum(list, 'cents')),
    };
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
            logged.filter((entry) => entry.week === key),
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
    generalCosting,
    unlinked: {
      entries: generalCosting?.entries || 0,
      hours: activities.length ? Math.max(0, hours - linkedHours) : 0,
      spent: activities.length ? fromCents(spentCents - linkedCents) : 0,
    },
    review,
    history: {
      records: history.records,
      hours: sum(history.entries, 'hours'),
      spent: fromCents(sum(history.entries, 'cents')),
    },
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
    warning: status.flags.highBurn ? 'Spending faster than planned.' : null,
  };
}

// Cost of one week laid out like the timesheet: one row per General/phase
// line (or per activity), one cell per day, in cents-accurate dollars.
export function weekCostRows(
  project,
  settings = {},
  week,
  { by = 'phase' } = {},
) {
  const rate = projectRateOf(project, settings),
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
    if (!rows.has(id)) rows.set(id, { id, name, days: {}, hours: 0, cents: 0 });
    return rows.get(id);
  };
  if (by === 'activity')
    activities.forEach((activity) => rowFor(activity.id, activity.name));
  else {
    rowFor(GENERAL_NOTE_ID, 'General');
    phasesOf(project).forEach((task) => rowFor(task.id, task.name));
  }
  const activityIds = new Set(activities.map((activity) => activity.id));
  const add = (row, entry, hours, cents) => {
    const cell = (row.days[entry.day] ||= {
      hours: 0,
      cents: 0,
      onLeave: false,
    });
    cell.hours += hours;
    cell.cents += cents;
    cell.onLeave ||= entry.onLeave;
    if (!entry.onLeave) {
      row.hours += hours;
      row.cents += cents;
    }
  };
  for (const entry of entries) {
    if (by !== 'activity') {
      add(
        rowFor(entry.taskId, entry.taskName),
        entry,
        entry.hours,
        entry.cents,
      );
      continue;
    }
    // Split entries land on each of their activities.
    const { split = {} } = entryActivity(
      withActivities,
      entry.taskId,
      entry.week,
      entry.day,
      cache,
      entry.hours,
    );
    const cents = shareCents(split, entry.hours, entry.cents);
    let linkedHours = 0,
      linkedCents = 0;
    for (const [id, hours] of Object.entries(split))
      if (activityIds.has(id)) {
        add(rowFor(id, ''), entry, hours, cents[id] || 0);
        linkedHours += hours;
        linkedCents += cents[id] || 0;
      }
    if (entry.hours - linkedHours > EPSILON / 2)
      add(
        rowFor(GENERAL_BUCKET, 'General'),
        entry,
        entry.hours - linkedHours,
        entry.cents - linkedCents,
      );
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
    (row) =>
      row.id === GENERAL_NOTE_ID ||
      row.hours > EPSILON ||
      Object.keys(row.days).length,
  );
}

// Portfolio view for the financials screen.
export function financialsOverview(
  projects,
  settings = {},
  week,
  { includeArchived = false } = {},
) {
  const list = projects
    .filter((project) => includeArchived || !project.archived)
    .map((project) => projectFinance(project, settings, week));
  const total = (key) =>
    fromCents(list.reduce((n, item) => n + toCents(item[key] || 0), 0));
  const budgeted = list.filter((item) => item.hasBudget);
  return {
    rate: hourlyRateOf(settings),
    // Costing works when the workspace or any listed project has a rate.
    hasRate:
      hourlyRateOf(settings) != null || list.some((item) => item.hasRate),
    mixedRates:
      new Set(list.filter((i) => i.hasRate).map((i) => i.rate)).size > 1,
    perDay: hoursPerDay(settings),
    projects: list,
    budgeted: budgeted.length,
    totals: {
      budget: fromCents(
        budgeted.reduce((n, item) => n + toCents(item.budget), 0),
      ),
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
    hourlyRate: text(normaliseMoney(project?.hourlyRate, RATE_MAX)),
    phaseBudgets: Object.fromEntries(
      Object.entries(
        isPlainObject(project?.phaseBudgets) ? project.phaseBudgets : {},
      ).map(([taskId, value]) => [taskId, text(normaliseMoney(value))]),
    ),
    activities: normaliseActivities(project?.activities).map((activity) => ({
      id: activity.id,
      name: activity.name,
      amount: text(activity.amount),
      unit: '$',
      aliases: (activity.aliases || []).join(', '),
    })),
  };
}

// How many entries are explicitly tagged to each activity (for the editor).
export function activityTagCounts(project) {
  const counts = {};
  for (const weeks of Object.values(project?.activityTags || {}))
    for (const days of Object.values(weeks || {}))
      for (const tag of Object.values(days || {}))
        // A split counts once for every activity it charges.
        for (const id of isPlainObject(tag) ? Object.keys(tag) : [tag])
          counts[id] = (counts[id] || 0) + 1;
  return counts;
}

// Percent of a budget used. Rounding never crosses a status line: 74.6%
// reads 74% (still green), 99.6% reads 99% and 100.1% reads 101%.
export const percentOf = (value) => {
  const pct = value * 100;
  if (Math.abs(pct - Math.round(pct)) < 1e-9) return Math.round(pct);
  return pct < 100 ? Math.floor(pct) : Math.ceil(pct);
};
export const formatPercent = (value) =>
  value == null ? '—' : value === Infinity ? 'over' : `${percentOf(value)}%`;

// ---------- Manual split editor ----------
const round2 = (n) => Math.round(n * 100) / 100;

// Starting rows for "Split across activities…": the current split when it
// names a costing (picked or suggested from the note); otherwise the most
// likely costing with all the hours plus an empty row to fill in.
export function splitEditorRows(resolved, activities, total) {
  const ids = activities.map((activity) => activity.id),
    split = resolved?.split || {},
    named = Object.keys(split).filter((key) => ids.includes(key));
  if (named.length) {
    const rows = named.map((key) => ({ key, hours: String(split[key]) }));
    if (split[GENERAL_BUCKET] > 0)
      rows.push({ key: GENERAL_BUCKET, hours: String(split[GENERAL_BUCKET]) });
    return rows;
  }
  const likely =
    (resolved?.parts || [])
      .flatMap((part) => part.candidates || [])
      .sort((a, b) => b.score - a.score)
      .find((candidate) => ids.includes(candidate.activityId))?.activityId ||
    ids[0];
  return [
    { key: likely || GENERAL_BUCKET, hours: String(round2(total)) },
    { key: '', hours: '' },
  ];
}

// Validates editor rows into a split tag. Rows without an activity are
// ignored, repeated activities are merged, the remainder goes to General, and
// a total above the entry's hours is refused.
export function commitSplitRows(rows, total) {
  const split = {};
  let given = 0;
  for (const [index, row] of rows.entries()) {
    const text = String(row.hours ?? '').trim();
    if (!row.key && !text) continue;
    // Plain decimals or H:MM only ("0x1" and "1e1" are not hours), and no
    // more than two decimals so nothing is rounded without saying so.
    if (text !== '' && !/^(\d+(\.\d{0,2})?|\.\d{1,2}|\d+:[0-5]\d)$/.test(text))
      return {
        error: /^\d*\.\d{3,}$/.test(text)
          ? 'Use up to two decimals, like 1.25.'
          : 'Enter hours as a number, like 1.5 or 1:30.',
        row: index,
      };
    const [whole, mins] = text.split(':');
    const hours =
      text === ''
        ? 0
        : mins != null
          ? round2(Number(whole) + Number(mins) / 60)
          : Number(text);
    if (!Number.isFinite(hours) || hours < 0)
      return { error: 'Enter hours as a number, like 1.5.', row: index };
    if (!row.key) {
      if (hours > 0)
        return { error: 'Choose a costing for these hours.', row: index };
      continue;
    }
    if (hours <= 0) continue;
    split[row.key] = round2((split[row.key] || 0) + hours);
    given = round2(given + hours);
  }
  if (given > total + 0.005)
    return {
      error: `That is ${round2(given - total)}h more than the ${round2(total)}h logged.`,
      over: round2(given - total),
    };
  const rest = round2(total - given);
  if (rest > 0)
    split[GENERAL_BUCKET] = round2((split[GENERAL_BUCKET] || 0) + rest);
  return { split, allocated: given, remainder: rest };
}

// ---------- Historical usage ----------
// Work done on a project before it was logged here (or logged elsewhere),
// entered as one total in hours or dollars and broken down by phase bucket
// and by costing. Each breakdown adds up to the total: what is not given to
// a phase sits in General, and what is not given to a costing sits in the
// General costing bucket ('none'). Stored as project.historicalUsage:
// [{ id, label, asOf, unit: 'hours' | 'money', total, phases, activities }].
export const HISTORY_HOURS_MAX = 100_000;
export const HISTORY_DEFAULT_LABEL = 'Before TimeMaster';

// Amounts are kept to two decimals (cents or hundredths of an hour) and
// summed as whole hundredths so the breakdowns always add up exactly.
const hundredths = (raw) => {
  const n = typeof raw === 'string' ? Number(raw.trim()) : raw;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? toCents(n) : 0;
};

const isDateKey = (value) =>
  typeof value === 'string' &&
  WEEK_KEY.test(value) &&
  dateString(value) === value;

export const usageMax = (unit) =>
  unit === 'money' ? MONEY_MAX : HISTORY_HOURS_MAX;

// "12.5h" or "$1,200.50".
export const formatUsage = (value, unit) =>
  value == null
    ? '—'
    : unit === 'money'
      ? formatMoney(value)
      : `${Math.round(Number(value) * 100) / 100}h`;

// Folds a stored breakdown into valid keys (unknown ones go to `rest`) and
// fills it up to the total with `rest`. Returns null when it adds up to more.
function foldBreakdown(raw, isValid, rest, totalH) {
  const out = {};
  let given = 0;
  for (const [key, value] of Object.entries(isPlainObject(raw) ? raw : {})) {
    const h = hundredths(value);
    if (!h) continue;
    const target = isValid(key) ? key : rest;
    out[target] = (out[target] || 0) + h;
    given += h;
  }
  if (given > totalH) return null;
  if (given < totalH) out[rest] = (out[rest] || 0) + totalH - given;
  return Object.fromEntries(
    Object.entries(out).map(([key, h]) => [key, fromCents(h)]),
  );
}

export function normaliseHistoricalUsage(list, project, activities = []) {
  if (!Array.isArray(list)) return [];
  const phaseIds = nonGeneralTaskIds(project),
    activityIds = new Set(activities.map((activity) => activity.id)),
    seen = new Set();
  return list.flatMap((item, index) => {
    if (!isPlainObject(item)) return [];
    const unit = item.unit === 'money' ? 'money' : 'hours';
    // A deleted phase's share moves to General; the total is never smaller
    // than what its phases add up to.
    let phaseH = 0;
    for (const value of Object.values(
      isPlainObject(item.phases) ? item.phases : {},
    ))
      phaseH += hundredths(value);
    const totalH = Math.max(hundredths(item.total), phaseH);
    if (!totalH || totalH > toCents(usageMax(unit))) return [];
    const phases = foldBreakdown(
      item.phases,
      (key) => key === GENERAL_NOTE_ID || phaseIds.has(key),
      GENERAL_NOTE_ID,
      totalH,
    );
    // A deleted costing's share moves to the General costing bucket, like a
    // split; a breakdown that adds up to more than the total is dropped.
    const activityBreakdown = foldBreakdown(
      item.activities,
      (key) => key === NO_ACTIVITY_TAG || activityIds.has(key),
      NO_ACTIVITY_TAG,
      totalH,
    ) || { [NO_ACTIVITY_TAG]: fromCents(totalH) };
    let id = String(item.id ?? '').trim() || `history-${index + 1}`;
    if (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    return [
      {
        id,
        label:
          String(item.label ?? '')
            .trim()
            .slice(0, 80) || HISTORY_DEFAULT_LABEL,
        asOf: isDateKey(item.asOf) ? item.asOf : null,
        unit,
        total: fromCents(totalH),
        phases,
        activities: activityBreakdown,
      },
    ];
  });
}

// Pseudo entries (one per phase share) and costing shares for the costing
// in projectFinance. Hours are costed at the project's rate like logged time;
// dollars are taken as given. Usage dated "up to" a day sits in that week on
// the spend chart; undated usage comes before everything.
function historicalUsageParts(project, activities, rate) {
  const records = normaliseHistoricalUsage(
    project.historicalUsage,
    project,
    activities,
  );
  const names = new Map(phasesOf(project).map((task) => [task.id, task.name]));
  const entries = [],
    shares = [],
    summaries = [];
  for (const record of records) {
    const cents =
        record.unit === 'money'
          ? toCents(record.total)
          : entryCents(record.total, rate),
      hoursOf = (value) => (record.unit === 'hours' ? value : 0),
      week = record.asOf ? weekKeyFor(record.asOf) : '',
      phaseCents = shareCents(record.phases, record.total, cents),
      activityCents = shareCents(record.activities, record.total, cents),
      activity = { split: {}, source: 'history', status: 'history', parts: [] };
    for (const [taskId, value] of Object.entries(record.phases))
      entries.push({
        taskId,
        taskName:
          taskId === GENERAL_NOTE_ID ? 'General' : names.get(taskId) || '',
        week,
        day: null,
        hours: hoursOf(value),
        onLeave: false,
        historical: true,
        recordId: record.id,
        cents: phaseCents[taskId] || 0,
        activity,
      });
    const entry = { historical: true, recordId: record.id, activity };
    for (const [id, value] of Object.entries(record.activities))
      shares.push({
        entry,
        id,
        hours: hoursOf(value),
        cents: activityCents[id] || 0,
      });
    summaries.push({
      ...record,
      cost: fromCents(cents),
      hours: record.unit === 'hours' ? record.total : null,
    });
  }
  return { entries, shares, records: summaries };
}

// Adds or replaces one record (by id) and re-normalises the project.
export function setHistoricalUsageRecord(project, record) {
  const list = Array.isArray(project.historicalUsage)
    ? project.historicalUsage
    : [];
  const exists = list.some((item) => item.id === record.id);
  return normaliseProjectFinance({
    ...project,
    historicalUsage: exists
      ? list.map((item) => (item.id === record.id ? record : item))
      : [...list, record],
  });
}

export function removeHistoricalUsageRecord(project, recordId) {
  return {
    ...project,
    historicalUsage: (project.historicalUsage || []).filter(
      (item) => item.id !== recordId,
    ),
  };
}

// Editable text draft for the historical usage wizard. General and the
// General costing bucket are not typed: they take whatever is left.
export function historicalDraftOf(record = null) {
  const text = (value) => (value == null ? '' : String(value));
  const typed = (breakdown, rest) =>
    Object.fromEntries(
      Object.entries(breakdown || {})
        .filter(([key]) => key !== rest)
        .map(([key, value]) => [key, text(value)]),
    );
  return {
    id: record?.id || null,
    label: record?.label ?? HISTORY_DEFAULT_LABEL,
    asOf: record?.asOf || '',
    unit: record?.unit === 'money' ? 'money' : 'hours',
    total: text(record?.total),
    phases: typed(record?.phases, GENERAL_NOTE_ID),
    activities: typed(record?.activities, NO_ACTIVITY_TAG),
  };
}

// Typed hours ("12.5", "7:30") or dollars ("4,000.50") for historical usage.
export function parseUsageAmount(value, unit, label = 'Amount') {
  if (unit === 'money') return parseMoney(value, { label });
  const s = String(value ?? '').trim();
  if (!s) return { value: null };
  if (/^-/.test(s)) return { error: `${label} cannot be negative.` };
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2}|\d+:[0-5]\d)$/.test(s))
    return {
      error: /^\d*\.\d{3,}$/.test(s)
        ? 'Use up to two decimals, like 12.25.'
        : `${label} must be hours, like 12.5 or 7:30.`,
    };
  const [whole, mins] = s.split(':');
  const hours = mins != null ? Number(whole) + Number(mins) / 60 : Number(s);
  if (hours > HISTORY_HOURS_MAX) return { error: `${label} is too large.` };
  return { value: fromCents(toCents(hours)) };
}

// Validates the wizard's draft against a project. Errors are keyed by field
// ('label', 'asOf', 'total', 'phase:<id>', 'phases', 'activity:<id>',
// 'activities') so each step can check its own. `left` is what General and
// the General costing bucket receive.
export function validateHistoricalDraft(
  draft,
  project,
  { today = dateString(new Date()) } = {},
) {
  const errors = {},
    unit = draft.unit === 'money' ? 'money' : 'hours',
    label = String(draft.label ?? '').trim();
  if (label.length > 80) errors.label = 'Keep the name under 80 characters.';
  const asOf = String(draft.asOf ?? '').trim();
  if (asOf && !isDateKey(asOf)) errors.asOf = 'Enter a valid date.';
  else if (asOf && asOf > today)
    errors.asOf = 'Historical usage can’t be dated in the future.';
  const total = parseUsageAmount(draft.total, unit, 'Total');
  if (total.error) errors.total = total.error;
  else if (!total.value)
    errors.total =
      unit === 'money'
        ? 'Enter the dollars used so far.'
        : 'Enter the hours used so far.';
  const totalH = toCents(total.value || 0);
  const breakdown = (keys, typed, prefix, noun) => {
    const out = {};
    let given = 0;
    for (const key of keys) {
      const parsed = parseUsageAmount(typed?.[key], unit, noun);
      if (parsed.error) errors[`${prefix}:${key}`] = parsed.error;
      else if (parsed.value) {
        out[key] = parsed.value;
        given += toCents(parsed.value);
      }
    }
    return { out, left: fromCents(totalH - given), given: fromCents(given) };
  };
  const phases = breakdown(
      phasesOf(project).map((task) => task.id),
      draft.phases,
      'phase',
      'Phase usage',
    ),
    activities = breakdown(
      normaliseActivities(project?.activities).map((activity) => activity.id),
      draft.activities,
      'activity',
      'Costing usage',
    );
  if (!errors.total && phases.left < 0)
    errors.phases = `The phases add up to ${formatUsage(-phases.left, unit)} more than the ${formatUsage(total.value, unit)} total.`;
  if (!errors.total && activities.left < 0)
    errors.activities = `The costings add up to ${formatUsage(-activities.left, unit)} more than the ${formatUsage(total.value, unit)} total.`;
  const record = Object.keys(errors).length
    ? null
    : {
        id: draft.id || `history-${uuid()}`,
        label: label || HISTORY_DEFAULT_LABEL,
        asOf: asOf || null,
        unit,
        total: total.value,
        phases: {
          ...phases.out,
          ...(phases.left > 0 ? { [GENERAL_NOTE_ID]: phases.left } : {}),
        },
        activities: {
          ...activities.out,
          ...(activities.left > 0
            ? { [NO_ACTIVITY_TAG]: activities.left }
            : {}),
        },
      };
  return {
    errors,
    unit,
    total: total.value ?? null,
    phases,
    activities,
    record,
  };
}
