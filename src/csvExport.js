import { DAY_SHORT, dayDate, dateString } from './utils.js';

const escapeCell = value => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function buildTimesheetCsv(projects) {
  const rows = [['Date', 'Day', 'Project', 'Client', 'Code', 'Task', 'Hours']];
  for (const project of projects) {
    const sources = [{name: 'General', entries: project.entries || {}}, ...(project.tasks || [])
      .filter(task => task.id !== 'general' && task.name.toLowerCase() !== 'general')
      .map(task => ({name: task.name, entries: project.taskEntries?.[task.id] || {}}))];
    for (const source of sources) for (const [week, entries] of Object.entries(source.entries)) {
      for (const [day, hours] of Object.entries(entries || {})) {
        const numeric = Number(hours);
        if (!Number.isFinite(numeric) || numeric <= 0) continue;
        const dayIndex = Number(day);
        rows.push([
          dateString(dayDate(week, dayIndex)),
          DAY_SHORT[dayIndex],
          project.name,
          project.client || '',
          project.code || '',
          source.name,
          numeric.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
        ]);
      }
    }
  }
  rows.splice(1, rows.length - 1, ...rows.slice(1).sort((a, b) => a[0].localeCompare(b[0]) || a[2].localeCompare(b[2])));
  return rows.map(row => row.map(escapeCell).join(',')).join('\r\n');
}

export function downloadTimesheetCsv(projects, name = `timesheet-${dateString(new Date())}.csv`) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(new Blob([buildTimesheetCsv(projects)], {type: 'text/csv;charset=utf-8'}));
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
}
