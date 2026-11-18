import { uuid, weeklyPlan } from './utils.js';

/** Normalise: resourcing CSV uses `resourcedHours`, timesheet uses `totalHours`. */
function getResourcedHours(parsed) {
  const v = parsed.resourcedHours ?? parsed.totalHours ?? 0;
  const n = Number(v);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

export function classifyProject(parsed, existingProjects, format, weekKey) {
  const resourcedHours = getResourcedHours(parsed);
  const item = { ...parsed, resourcedHours };

  const match = existingProjects.find(
    (ep) => ep.name.toLowerCase().trim() === item.name.toLowerCase().trim(),
  );

  if (!match) return { ...item, status: 'new', existingId: null };

  const existingWeekly = weeklyPlan(match, weekKey);
  const unchanged =
    format === 'timesheet'
      ? Object.entries(item.dailyHours || {}).every(
          ([day, hours]) =>
            Math.abs(
              Number(match.entries?.[weekKey]?.[day] || 0) - Number(hours || 0),
            ) < 0.01,
        )
      : Math.abs(Number(existingWeekly || 0) - resourcedHours) < 0.01;

  if (unchanged) {
    return {
      ...item,
      status: 'skip',
      existingId: match.id,
      existingHours: existingWeekly,
    };
  }

  return {
    ...item,
    status: 'update',
    existingId: match.id,
    existingHours: existingWeekly,
  };
}

export function importProjects(workspace, result, items, week) {
  let projects = [...workspace.projects];
  for (const item of items) {
    let index = projects.findIndex(
      (p) => p.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
    );
    if (index < 0) {
      projects.push({
        id: uuid(),
        name: item.name,
        isBillable: false,
        resourcedHours:
          result.format === 'resourcing'
            ? Number(item.resourcedHours || 0)
            : null,
        monthlyResourcedHours: null,
        entries: {},
        tasks: [{ id: 'general', name: 'General' }],
        taskEntries: {},
        taskRows: {},
        weeklyOverrides: {},
        frontloads: {},
        hiddenWeeks: [],
        visibleOnwardsFrom: result.weekKey || week,
        createdAt: new Date().toISOString(),
      });
      index = projects.length - 1;
    }
    const p = { ...projects[index] };
    if (result.format === 'timesheet') {
      p.entries = {
        ...(p.entries || {}),
        [result.weekKey]: {
          ...(p.entries?.[result.weekKey] || {}),
          ...(item.dailyHours || {}),
        },
      };
    } else if (result.format === 'resourcing') {
      p.resourcedHours = Number(item.resourcedHours || 0);
      p.weeklyOverrides = {
        ...(p.weeklyOverrides || {}),
        [result.weekKey]: Number(item.resourcedHours || 0),
      };
    }
    projects[index] = p;
  }
  return { ...workspace, projects };
}
