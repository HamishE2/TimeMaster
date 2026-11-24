import { hasPhases, phasesOf } from './tasks.js';
import { taskHoursForDay, taskLinesFor } from './taskLines.js';
import { EPSILON, fmt } from './utils.js';

// Quick entry: a one-line command bar for the timesheet.
//   "3h qrgs tue"            add 3h to the QRGs phase on Tuesday
//   "=2 acme mon-wed"        set Acme to 2h on Monday to Wednesday
//   "fill acme"              top today up to capacity on Acme
//   "fill fri audit"         top Friday up to capacity on Audit
//   "clear acme thu"         remove Thursday's hours (and note) on Acme
//   '1:30 acme "kickoff"'    add 1.5h today with a note
// parseQuickEntry only reads the text; resolveQuickEntry turns it into
// cell updates against the visible week.

const DAY_WORDS = [
  ['mon', 'monday'],
  ['tue', 'tues', 'tuesday'],
  ['wed', 'weds', 'wednesday'],
  ['thu', 'thur', 'thurs', 'thursday'],
  ['fri', 'friday'],
  ['sat', 'saturday'],
  ['sun', 'sunday'],
];
const dayIndex = (word) =>
  DAY_WORDS.findIndex((names) => names.includes(word.toLowerCase()));
const FILLER = new Set([
  'on',
  'to',
  'for',
  'at',
  'in',
  'of',
  'the',
  'log',
  'add',
  'hours',
  'hour',
  'hrs',
  'hr',
  'h',
  'rest',
  'day',
  'up',
  '-',
]);

function parseAmount(token) {
  let match = token.match(/^([+=]?)(\d{1,2}):([0-5]\d)h?$/);
  if (match)
    return { sign: match[1], hours: Number(match[2]) + Number(match[3]) / 60 };
  match = token.match(/^([+=]?)(\d+(?:\.\d+)?)(m|mins?|minutes?)$/i);
  if (match) return { sign: match[1], hours: Number(match[2]) / 60 };
  match = token.match(/^([+=]?)(\d+(?:\.\d+)?|\.\d+)(h|hrs?|hours?)?$/i);
  if (match) return { sign: match[1], hours: Number(match[2]) };
  return null;
}

function parseDays(token) {
  const range = token.match(/^([a-z]+)-([a-z]+)$/i);
  if (range) {
    const from = dayIndex(range[1]),
      to = dayIndex(range[2]);
    if (from >= 0 && to >= from)
      return Array.from({ length: to - from + 1 }, (_, i) => from + i);
    if (from >= 0 && to >= 0) return 'backwards';
  }
  if (token.includes(',')) {
    const list = token.split(',').filter(Boolean).map(dayIndex);
    if (list.length && list.every((d) => d >= 0)) return list;
  }
  const lower = token.toLowerCase();
  if (lower === 'today' || lower === 'yesterday' || lower === 'tomorrow')
    return lower;
  const one = dayIndex(token);
  return one >= 0 ? [one] : null;
}

export function parseQuickEntry(text) {
  const source = String(text ?? '').trim();
  if (!source) return { empty: true };
  let note = '';
  const withoutNote = source
    .replace(/["“”]([^"“”]*)["“”]?/, (_, inner) => {
      note = inner.trim();
      return ' ';
    })
    .replace(/\s+\/\/\s*(.*)$/, (_, inner) => {
      note = note || inner.trim();
      return ' ';
    });
  const tokens = withoutNote.split(/\s+/).filter(Boolean);
  const result = { kind: 'add', hours: null, days: null, terms: [], note };
  for (const raw of tokens) {
    const token = raw.replace(/[.,;:!?]+$/, '') || raw;
    const lower = token.toLowerCase();
    if (lower === 'fill' || lower === 'top') {
      result.kind = 'fill';
      continue;
    }
    if (lower === 'clear' || lower === 'remove' || lower === 'delete') {
      result.kind = 'clear';
      continue;
    }
    if (lower === 'set') {
      result.kind = 'set';
      continue;
    }
    if (result.hours == null) {
      const amount = parseAmount(token);
      if (amount) {
        result.hours = amount.hours;
        if (amount.sign === '=') result.kind = 'set';
        continue;
      }
    }
    const days = parseDays(token);
    if (days === 'backwards') {
      result.backwards = token;
      continue;
    }
    if (days) {
      if (typeof days === 'string') result.days = days;
      else
        result.days = [
          ...new Set([...(Array.isArray(result.days) ? result.days : []), ...days]),
        ];
      continue;
    }
    if (FILLER.has(lower)) continue;
    result.terms.push(lower.replace(/[^\p{L}\p{N}&]+/gu, ''));
  }
  result.terms = result.terms.filter(Boolean);
  if (result.backwards)
    result.error = `Write day ranges forwards, like “mon-wed” (not “${result.backwards}”).`;
  else if (result.kind !== 'fill' && result.kind !== 'clear' && result.hours == null)
    result.error = 'Add an amount, like 2h, 1:30 or 45m.';
  else if (result.hours != null && result.hours > 24)
    result.error = 'A day cannot exceed 24 hours.';
  else if (!result.terms.length)
    result.error = 'Name a project or phase, like “2h acme”.';
  return result;
}

const words = (value) =>
  String(value || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}&]+/u)
    .filter(Boolean);

// How well a search term matches a name: whole word beats prefix beats
// substring; initials ("qrg" for "Quick Reference Guides") count as prefix.
function termScore(term, name) {
  const single = term.length > 3 && term.endsWith('s') ? term.slice(0, -1) : null;
  return Math.max(rawScore(term, name), single ? rawScore(single, name) : 0);
}

function rawScore(term, name) {
  const parts = words(name);
  if (!parts.length) return 0;
  if (parts.includes(term)) return 3;
  if (parts.some((part) => part.startsWith(term))) return 2;
  const initials = parts.map((part) => part[0]).join('');
  if (term.length > 1 && initials.startsWith(term)) return 2;
  if (String(name).toLowerCase().replace(/\s+/g, '').includes(term)) return 1;
  return 0;
}

function candidatesFor(projects, week) {
  const list = [];
  for (const project of projects) {
    const projectText = [project.name, project.client, project.code];
    if (hasPhases(project)) {
      const onSheet = new Set(taskLinesFor(project, week).map((t) => t.id));
      for (const task of phasesOf(project))
        list.push({ project, task, projectText, onSheet: onSheet.has(task.id) });
      list.push({ project, task: null, projectText, phased: true });
    } else list.push({ project, task: null, projectText });
  }
  return list;
}

function score(candidate, terms) {
  let total = 0,
    taskHits = 0;
  for (const term of terms) {
    const project = Math.max(
        ...candidate.projectText.map((text) => termScore(term, text)),
      ),
      task = candidate.task ? termScore(term, candidate.task.name) : 0;
    if (!project && !task) return null;
    total += Math.max(project, task);
    if (task >= project && task) taskHits += 1;
  }
  return { total, taskHits };
}

export function hoursIn(project, taskId, week, day) {
  const value = taskId
    ? project.taskEntries?.[taskId]?.[week]?.[day]
    : project.entries?.[week]?.[day];
  return value == null ? null : Number(value);
}

export function dayTotalFor(projects, week, day) {
  return projects.reduce(
    (sum, project) =>
      sum +
      Number(project.entries?.[week]?.[day] || 0) +
      taskHoursForDay(project, week, day),
    0,
  );
}

const round2 = (value) => Math.round(value * 100) / 100;

// context: { projects, week, days, leave, todayIndex (null when the week is
// not the current one), capacityByDay }
export function resolveQuickEntry(parsed, context) {
  if (!parsed || parsed.empty) return { empty: true };
  if (parsed.error) return { error: parsed.error };
  const { projects, week, days, leave = [], capacityByDay = [] } = context;
  const fallbackDay =
    context.todayIndex != null && days.includes(context.todayIndex)
      ? context.todayIndex
      : days.find((day) => !leave.includes(day));
  let targetDays;
  if (parsed.days === 'today') targetDays = [context.todayIndex ?? fallbackDay];
  else if (parsed.days === 'yesterday' || parsed.days === 'tomorrow') {
    if (context.todayIndex == null)
      return { error: `“${parsed.days}” only works on the current week.` };
    targetDays = [context.todayIndex + (parsed.days === 'tomorrow' ? 1 : -1)];
  } else targetDays = parsed.days || [fallbackDay];
  targetDays = targetDays.filter((day) => day != null);
  if (!targetDays.length) return { error: 'No open day to log against.' };
  const hidden = targetDays.find((day) => !days.includes(day));
  if (hidden != null) return { error: 'That day is not shown on this week.' };
  const onLeave = targetDays.find((day) => leave.includes(day));
  if (onLeave != null) return { error: 'That day is marked as leave.' };

  const scored = candidatesFor(projects, week)
    .map((candidate) => ({ candidate, score: score(candidate, parsed.terms) }))
    // A phase only counts when a term names it; project-only matches go
    // through the project's phased candidate instead.
    .filter(
      (item) =>
        item.score && (!item.candidate.task || item.score.taskHits > 0),
    )
    .sort(
      (a, b) =>
        b.score.total - a.score.total ||
        b.score.taskHits - a.score.taskHits ||
        Number(Boolean(b.candidate.onSheet)) -
          Number(Boolean(a.candidate.onSheet)) ||
        Number(Boolean(a.candidate.phased)) -
          Number(Boolean(b.candidate.phased)),
    );
  if (!scored.length)
    return { error: `No project or phase matches “${parsed.terms.join(' ')}”.` };
  const best = scored[0],
    tied = scored.filter(
      (item) =>
        item.score.total === best.score.total &&
        item.score.taskHits === best.score.taskHits &&
        Boolean(item.candidate.onSheet) === Boolean(best.candidate.onSheet) &&
        Boolean(item.candidate.phased) === Boolean(best.candidate.phased) &&
        item.candidate !== best.candidate,
    );
  if (tied.length)
    return {
      error: `“${parsed.terms.join(' ')}” matches ${[best, ...tied]
        .slice(0, 3)
        .map(({ candidate }) =>
          candidate.task
            ? `${candidate.project.name} · ${candidate.task.name}`
            : candidate.project.name,
        )
        .join(', ')}. Add a word to pick one.`,
    };
  let { project, task } = best.candidate;
  if (best.candidate.phased) {
    const lines = taskLinesFor(project, week),
      phases = phasesOf(project);
    task = lines.length === 1 ? lines[0] : phases.length === 1 ? phases[0] : null;
    if (!task)
      return {
        error: `${project.name} has phases. Add one, like “${parsed.hours ?? 2}h ${parsed.terms[0]} ${phases[0].name.toLowerCase()}”.`,
      };
  }
  const taskId = task?.id ?? null,
    label = task ? `${project.name} · ${task.name}` : project.name;
  const ops = [];
  for (const day of targetDays) {
    const current = hoursIn(project, taskId, week, day);
    let value;
    if (parsed.kind === 'clear') value = null;
    else if (parsed.kind === 'set') value = parsed.hours;
    else if (parsed.kind === 'fill') {
      const gap = Number(capacityByDay[day] || 0) - dayTotalFor(projects, week, day);
      if (gap <= EPSILON) continue;
      value = (current || 0) + gap;
    } else value = (current || 0) + parsed.hours;
    if (value != null) {
      value = round2(value);
      if (value > 24) return { error: 'A day cannot exceed 24 hours.' };
      if (value <= 0) value = null;
    }
    if (value === current && !parsed.note) continue;
    ops.push({ projectId: project.id, taskId, day, value, from: current });
  }
  if (!ops.length)
    return {
      error:
        parsed.kind === 'fill'
          ? 'Already at capacity — nothing to fill.'
          : 'Nothing would change.',
    };
  const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const change = ops
    .map((op) =>
      op.value == null
        ? `${DAY[op.day]} cleared`
        : `${DAY[op.day]} ${op.from ? `${fmt(op.from)}→` : ''}${fmt(op.value)}h`,
    )
    .join(', ');
  return {
    ops,
    project,
    task,
    note: parsed.kind === 'clear' ? '' : parsed.note,
    summary: `${label}: ${change}`,
  };
}

// Example commands built from the workspace itself, so suggestion chips name
// real projects and phases. Each pairs a verb with a word that names exactly one
// project or phase on the visible week. Empty when nothing fits.
export function quickEntryExamples(context) {
  const { projects = [], week, days = [], leave = [] } = context;
  const open = days.filter((day) => !leave.includes(day));
  if (!open.length) return [];
  const DAY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const one = DAY[open[Math.min(1, open.length - 1)]],
    first = open.slice(0, 3),
    // A range must not cross a leave day, so list split days instead.
    range =
      first.length < 2
        ? DAY[first[0]]
        : first.at(-1) - first[0] === first.length - 1
          ? `${DAY[first[0]]}-${DAY[first.at(-1)]}`
          : first.map((day) => DAY[day]).join(',');
  const named = [];
  for (const candidate of candidatesFor(projects, week)) {
    if (candidate.phased) continue;
    const name = candidate.task ? candidate.task.name : candidate.project.name;
    const word = words(name).find(
      (part) =>
        part.length >= 3 &&
        !FILLER.has(part) &&
        dayIndex(part) < 0 &&
        !/^\d/.test(part) &&
        !['fill', 'top', 'clear', 'remove', 'delete', 'set', 'today'].includes(part),
    );
    if (!word) continue;
    const check = resolveQuickEntry(parseQuickEntry(`=1 ${word} ${one}`), {
      ...context,
      todayIndex: null,
    });
    if (
      check.ops &&
      check.project.id === candidate.project.id &&
      (check.task?.id ?? null) === (candidate.task?.id ?? null)
    )
      named.push({ word, onSheet: candidate.onSheet || !candidate.task });
  }
  named.sort((a, b) => Number(b.onSheet) - Number(a.onSheet));
  if (!named.length) return [];
  const pick = (i) => named[i % named.length].word;
  return [
    `3h ${pick(0)} ${one}`,
    `fill ${pick(1)}`,
    `=2 ${pick(2)} ${range}`,
    `1:30 ${pick(3)} "kickoff"`,
  ].filter((example, i, all) => all.indexOf(example) === i);
}
