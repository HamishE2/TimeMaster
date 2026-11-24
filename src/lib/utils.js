import { taskEntrySources } from './taskLines.js';
import {
  normaliseFinanceSettings,
  normaliseProjectFinance,
} from './budget.js';

export const SCHEMA_VERSION = 3;
export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DEFAULT_VISIBLE_DAYS = [0, 1, 2, 3, 4];
export const DEFAULT_CAPACITY = [7.6, 7.6, 7.6, 7.6, 7.6, 0, 0];
export const WEEKLY_RESOURCING_CAPACITY = 22.8;
export const EPSILON = 0.01;

export const uuid = () =>
  crypto.randomUUID?.() ??
  `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
// A bare 'YYYY-MM-DD' string is parsed by `new Date` as UTC midnight, which is
// the previous day anywhere west of Greenwich. Read date keys as local noon.
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const toDate = (date) =>
  typeof date === 'string' && DATE_KEY.test(date)
    ? new Date(`${date}T12:00:00`)
    : new Date(date);
// A stored number of hours, or 0 when it is missing or not a number.
export const hoursValue = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
export function dateString(date) {
  const d = toDate(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function mondayFor(date) {
  const d = toDate(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
export const weekKeyFor = (date) => dateString(mondayFor(date));
export function shiftWeek(key, amount) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + amount * 7);
  return dateString(d);
}
export function weekDates(key, visibleDays) {
  const d = new Date(`${key}T12:00:00`);
  const all = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return day;
  });
  return visibleDays
    ? visibleDays.map((dayIndex) => ({ dayIndex, date: all[dayIndex] }))
    : all;
}
export function dayDate(key, index) {
  return weekDates(key)[index];
}
export function monthKey(date) {
  const d = toDate(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function weekLabel(key, days = DEFAULT_VISIBLE_DAYS) {
  const all = weekDates(key),
    first = all[days[0]],
    last = all[days.at(-1)];
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).formatRange(first, last);
}
export function fmt(value) {
  return Number(value || 0)
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
}
export function parseHours(value) {
  const s = String(value ?? '').trim();
  if (!s) return { value: null };
  const colon = s.match(/^(\d{1,3}):(\d{2})$/);
  if (colon) {
    const h = Number(colon[1]),
      m = Number(colon[2]);
    if (m >= 60) return { error: 'Minutes must be between 00 and 59.' };
    const total = h + m / 60;
    return total <= 24
      ? { value: total }
      : { error: 'A day cannot exceed 24 hours.' };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s))
    return { error: 'Enter decimal hours or H:MM.' };
  const n = Number(s);
  return n <= 24 ? { value: n } : { error: 'A day cannot exceed 24 hours.' };
}
export function isVisible(project, key) {
  return (
    !project.archived &&
    !(project.hiddenWeeks || []).includes(key) &&
    !(project.hiddenOnwardsFrom && key >= project.hiddenOnwardsFrom) &&
    !(project.visibleOnwardsFrom && key < project.visibleOnwardsFrom)
  );
}
export function weeklyPlan(project, key) {
  return project.weeklyOverrides && Object.hasOwn(project.weeklyOverrides, key)
    ? project.weeklyOverrides[key]
    : project.resourcedHours;
}
export function monthlyPlan(project, key) {
  return project.monthlyOverrides &&
    Object.hasOwn(project.monthlyOverrides, key)
    ? project.monthlyOverrides[key]
    : project.monthlyResourcedHours;
}
export function frontloadAmount(project, key) {
  const amount = Number(project.frontloads?.[key] || 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}
export function frontloadLimit(project, key) {
  const source = shiftWeek(key, 1),
    plan = weeklyPlan(project, source);
  if (plan == null || !Number.isFinite(Number(plan))) return null;
  return Math.max(0, Number(plan) + frontloadAmount(project, source));
}
export function entryHours(project, key, day, includeLeave = true, leave = []) {
  return includeLeave || !leave.includes(day)
    ? hoursValue(project.entries?.[key]?.[day])
    : 0;
}

export function weeklyLogged(project, key, leave = []) {
  const general = Array.from({ length: 7 }, (_, d) =>
    entryHours(project, key, d, false, leave),
  ).reduce((a, b) => a + b, 0);
  const tasks = taskEntrySources(project).reduce(
    (total, entries) =>
      total +
      Array.from({ length: 7 }, (_, day) =>
        leave.includes(day) ? 0 : hoursValue(entries?.[key]?.[day]),
      ).reduce((a, b) => a + b, 0),
    0,
  );
  return general + tasks;
}
export function adjustmentFor(project, month) {
  return hoursValue(
    project.monthlyAdjustments?.[month] ??
      (project.historicalMonthlyMonth === month
        ? project.historicalMonthlyHours
        : 0),
  );
}
// The historical hours entered for the month a week's allowance belongs to
// (the month of its Thursday), or '' when none were entered for that month.
// Other months' adjustments must not be carried into this one.
export function historicalHoursForWeek(project, key) {
  const month = monthKey(dayDate(key, 3)),
    value =
      project?.monthlyAdjustments?.[month] ??
      (project?.historicalMonthlyMonth === month
        ? project.historicalMonthlyHours
        : undefined);
  return value == null ? '' : value;
}
export function monthlyLogged(project, month, leaveWeeks = {}) {
  let n = adjustmentFor(project, month);
  const sources = [project.entries || {}, ...taskEntrySources(project)];
  for (const source of sources)
    for (const [wk, entries] of Object.entries(source))
      for (const [d, h] of Object.entries(entries || {}))
        if (
          !leaveWeeks[wk]?.includes(Number(d)) &&
          monthKey(dayDate(wk, Number(d))) === month
        )
          n += hoursValue(h);
  return n;
}
export function monthlyAllowance(project, key, leaveWeeks = {}) {
  const allocation = monthlyPlan(project, key);
  if (
    allocation == null ||
    allocation === '' ||
    !Number.isFinite(Number(allocation))
  )
    return null;
  const month = monthKey(dayDate(key, 3));
  return Math.max(
    0,
    Number(allocation) -
      monthlyLogged(project, month, leaveWeeks) +
      weeklyLogged(project, key, leaveWeeks[key] || []),
  );
}
export function projectMetrics(project, key, leaveWeeks = {}) {
  const rawPlan = weeklyPlan(project, key),
    // An empty string is a cleared field, not a zero-hour plan.
    plan = rawPlan === '' ? null : rawPlan,
    logged = weeklyLogged(project, key, leaveWeeks[key] || []),
    monthly = monthlyAllowance(project, key, leaveWeeks),
    frontloadedIn = frontloadAmount(project, key),
    frontloadedOut = frontloadAmount(project, shiftWeek(key, -1)),
    hasWeeklyPlan = plan != null && Number.isFinite(Number(plan)),
    weeklyAllowance = hasWeeklyPlan
      ? Number(plan) + frontloadedIn - frontloadedOut
      : null,
    weeklyAvailable =
      weeklyAllowance == null ? null : Math.max(0, weeklyAllowance),
    effective =
      weeklyAllowance == null
        ? monthly
        : monthly == null
          ? weeklyAllowance
          : Math.min(weeklyAllowance, monthly),
    remaining = effective == null ? null : effective - logged,
    status =
      effective == null
        ? 'unlimited'
        : remaining < -EPSILON
          ? 'over'
          : Math.abs(remaining) <= EPSILON
            ? 'at'
            : 'under',
    overDueToFrontloading =
      frontloadedOut > EPSILON &&
      weeklyAllowance != null &&
      logged > weeklyAllowance + EPSILON;
  return {
    plan,
    logged,
    monthly,
    frontloadedIn,
    frontloadedOut,
    weeklyAllowance,
    weeklyAvailable,
    effective,
    remaining,
    status,
    overDueToFrontloading,
  };
}
export function weeklyResourcedHours(projects, key, leaveWeeks = {}) {
  return projects.reduce((total, project) => {
    const allowance = projectMetrics(project, key, leaveWeeks).weeklyAllowance;
    return total + Math.max(0, Number(allowance) || 0);
  }, 0);
}
export function capacityFor(key, settings) {
  const leave = settings.leaveWeeks?.[key] || [],
    visible = settings.visibleDays || DEFAULT_VISIBLE_DAYS,
    caps = settings.capacityByDay || DEFAULT_CAPACITY;
  return visible.reduce(
    (n, d) => n + (leave.includes(d) ? 0 : Math.max(0, hoursValue(caps[d]))),
    0,
  );
}
const isRecord = (value) =>
  value != null && typeof value === 'object' && !Array.isArray(value);
const dayIndex = (value) => {
  const n = Number(value);
  return value !== '' && Number.isInteger(n) && n >= 0 && n <= 6 ? n : null;
};
// null for a blank (unlimited) value, undefined for something unusable.
const optionalHours = (value) => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};
// { day: hours } with valid day indices and finite, non-negative hours.
const cleanDays = (days) =>
  Object.fromEntries(
    Object.entries(isRecord(days) ? days : {}).flatMap(([day, value]) => {
      const n = optionalHours(value);
      return dayIndex(day) != null && n != null && n >= 0 ? [[day, n]] : [];
    }),
  );
// { week: { day: hours } }, dropping weeks left empty.
const cleanWeeks = (weeks) =>
  Object.fromEntries(
    Object.entries(isRecord(weeks) ? weeks : {}).flatMap(([week, days]) => {
      const clean = cleanDays(days);
      return Object.keys(clean).length ? [[week, clean]] : [];
    }),
  );
// { key: hours | null }, where null keeps an explicit unlimited plan.
const cleanPlans = (plans) =>
  Object.fromEntries(
    Object.entries(isRecord(plans) ? plans : {}).flatMap(([key, value]) => {
      const n = optionalHours(value);
      return n === undefined ? [] : [[key, n]];
    }),
  );
const cleanNumbers = (values) =>
  Object.fromEntries(
    Object.entries(isRecord(values) ? values : {}).flatMap(([key, value]) => {
      const n = optionalHours(value);
      return n == null ? [] : [[key, n]];
    }),
  );
const cleanDayList = (days) =>
  [
    ...new Set(
      (Array.isArray(days) ? days : [])
        .map(dayIndex)
        .filter((day) => day != null),
    ),
  ].sort((a, b) => a - b);
// notes[taskId][week][day] = text
const cleanNotes = (notes) =>
  Object.fromEntries(
    Object.entries(notes).flatMap(([taskId, weeks]) => {
      const kept = Object.fromEntries(
        Object.entries(isRecord(weeks) ? weeks : {}).flatMap(
          ([week, days]) => {
            const text = Object.fromEntries(
              Object.entries(isRecord(days) ? days : {}).filter(
                ([day, value]) =>
                  dayIndex(day) != null &&
                  typeof value === 'string' &&
                  value.trim(),
              ),
            );
            return Object.keys(text).length ? [[week, text]] : [];
          },
        ),
      );
      return Object.keys(kept).length ? [[taskId, kept]] : [];
    }),
  );

// Normalises a backup, browser session or older export into the current
// workspace shape. Known fields are validated; fields this version does not
// know about (on settings, projects and tasks) are carried through untouched
// so a newer or extended workspace survives a round trip.
export function migrateBackup(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.projects))
    throw new Error('This backup does not contain a valid project list.');
  const rawSettings = isRecord(raw.settings) ? raw.settings : {},
    visibleDays = cleanDayList(rawSettings.visibleDays),
    rawCapacity = Array.isArray(rawSettings.capacityByDay)
      ? rawSettings.capacityByDay
      : DEFAULT_CAPACITY;
  const settings = {
    ...rawSettings,
    visibleDays: visibleDays.length ? visibleDays : DEFAULT_VISIBLE_DAYS,
    leaveWeeks: Object.fromEntries(
      Object.entries(
        isRecord(rawSettings.leaveWeeks) ? rawSettings.leaveWeeks : {},
      ).map(([week, days]) => [week, cleanDayList(days)]),
    ),
    capacityByDay: DEFAULT_CAPACITY.map((fallback, day) => {
      const n = optionalHours(rawCapacity[day]);
      return n == null || n < 0 ? fallback : n;
    }),
    theme:
      typeof rawSettings.theme === 'string' && rawSettings.theme
        ? rawSettings.theme
        : 'system',
  };
  const legacyEntries = Array.isArray(raw.entries) ? raw.entries : [];
  const projects = raw.projects.filter(isRecord).map((p, i) => {
    const tasks =
      Array.isArray(p.tasks) && p.tasks.some(isRecord)
        ? p.tasks.filter(isRecord).map((task) => ({
            ...task,
            id: task.id || uuid(),
            name: String(task.name || 'Untitled task').trim(),
          }))
        : [{ id: 'general', name: 'General' }];
    // Flat backups identified the General entry bucket by the task name.
    const generalIds = new Set(
      tasks
        .filter((task) => task.name.toLowerCase() === 'general')
        .map((task) => task.id),
    );
    const entries = cleanWeeks(p.entries);
    const taskEntries = Object.fromEntries(
      Object.entries(isRecord(p.taskEntries) ? p.taskEntries : {}).map(
        ([taskId, weeks]) => [taskId, cleanWeeks(weeks)],
      ),
    );
    for (const entry of legacyEntries.filter(
      (item) => item?.projectId === p.id,
    )) {
      const date = new Date(`${entry.date}T12:00:00`),
        key = weekKeyFor(date),
        day = (date.getDay() + 6) % 7,
        hours = Number(entry.hours) || 0;
      if (!hours || Number.isNaN(date.getTime())) continue;
      if (generalIds.has(entry.taskId))
        entries[key] = { ...(entries[key] || {}), [day]: hours };
      else
        taskEntries[entry.taskId] = {
          ...(taskEntries[entry.taskId] || {}),
          [key]: { ...(taskEntries[entry.taskId]?.[key] || {}), [day]: hours },
        };
    }
    const taskRows = Object.fromEntries(
      Object.entries(isRecord(p.taskRows) ? p.taskRows : {}).map(
        ([key, ids]) => [
          key,
          (Array.isArray(ids) ? ids : []).filter(
            (id) => typeof id === 'string',
          ),
        ],
      ),
    );
    for (const [key, rows] of Object.entries(raw.weekRows || {}))
      taskRows[key] = (Array.isArray(rows) ? rows : [])
        .filter(
          (row) => typeof row === 'string' && row.startsWith(`${p.id}::`),
        )
        .map((row) => row.slice(p.id.length + 2));
    const frontloads = Object.fromEntries(
      Object.entries(isRecord(p.frontloads) ? p.frontloads : {}).flatMap(
        ([key, value]) => {
          const amount = Math.round(Number(value) * 100) / 100,
            valid =
              DATE_KEY.test(key) &&
              weekKeyFor(new Date(`${key}T12:00:00`)) === key &&
              Number.isFinite(amount) &&
              amount > 0;
          return valid ? [[key, amount]] : [];
        },
      ),
    );
    const resourcedHours = optionalHours(
      p.resourcedHours ?? p.weeklyAllocation,
    );
    return {
      ...p,
      id: p.id || uuid(),
      name: String(p.name || `Untitled project ${i + 1}`).trim(),
      isBillable: p.isBillable !== false,
      resourcedHours: resourcedHours ?? null,
      monthlyResourcedHours: optionalHours(p.monthlyResourcedHours) ?? null,
      monthlyAdjustments: cleanNumbers(p.monthlyAdjustments),
      ...(p.historicalMonthlyHours !== undefined
        ? { historicalMonthlyHours: hoursValue(p.historicalMonthlyHours) }
        : {}),
      entries,
      tasks,
      taskEntries,
      taskRows,
      ...(isRecord(p.notes) ? { notes: cleanNotes(p.notes) } : {}),
      weeklyOverrides: cleanPlans(p.weeklyOverrides),
      monthlyOverrides: cleanPlans(p.monthlyOverrides),
      frontloads,
      hiddenWeeks: Array.isArray(p.hiddenWeeks)
        ? p.hiddenWeeks.filter((key) => typeof key === 'string')
        : [],
      hiddenOnwardsFrom: p.hiddenOnwardsFrom || null,
      visibleOnwardsFrom: p.visibleOnwardsFrom || null,
      archived: !!p.archived,
      client: p.client || '',
      code: p.code || '',
      createdAt: p.createdAt || new Date().toISOString(),
    };
  });
  // Budget, costing and rate fields are validated by the financials module.
  return {
    schemaVersion: SCHEMA_VERSION,
    projects: projects.map(normaliseProjectFinance),
    settings: { ...settings, ...normaliseFinanceSettings(settings) },
  };
}

// Compatibility helpers used by the original feature modules.
export const fmtHours = fmt;
export const parseTime = (value) => parseHours(value).value;
export const isUnlimited = (project) => project.resourcedHours == null;
export const usedHours = weeklyLogged;
export const getWeeklyResourced = (project, key, leaveWeeks = {}) =>
  projectMetrics(project, key, leaveWeeks).effective;
export const getMonthKeyForWeek = (key) => monthKey(dayDate(key, 3));
export const monthlyUsedHours = monthlyLogged;
export function remainingStatus(remaining, resourced) {
  if (resourced == null) return 'unlimited';
  if (remaining < -EPSILON) return 'danger';
  if (Math.abs(remaining) <= EPSILON) return 'at';
  if (resourced > 0 && remaining / resourced <= 0.2) return 'warning';
  return 'healthy';
}
export function remainingLabel(remaining, resourced) {
  if (resourced == null) return 'Unlimited';
  if (remaining < -EPSILON) return `${fmt(-remaining)}h over`;
  if (Math.abs(remaining) <= EPSILON) return 'At allocation';
  return `${fmt(remaining)}h left`;
}
export function dayLabel(date) {
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric' });
}
export function getCategorizedProjects(projects, visibleProjects) {
  const visible = new Set(visibleProjects.map((p) => p.id));
  const available = projects.filter((p) => !visible.has(p.id));
  return {
    active: available.filter((p) => !p.archived),
    inactive: available.filter((p) => p.archived),
  };
}
