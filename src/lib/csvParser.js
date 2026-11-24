// ─── CSV Parser ─────────────────────────────────────────────────────────
// Handles two ProjectWorks export formats:
//   1. Resourcing CSV  — project budgets with daily hours
//   2. Copy-paste Timesheet — actual hours per project/task

const MONTHS = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

// ─── Shared helpers ─────────────────────────────────────────────────────

/** Strip the numeric ID prefix from a ProjectWorks project name.
 *  "119168101849  QUT - M365 Copilot (1,000 seats)" → "QUT - M365 Copilot (1,000 seats)" */
export function cleanProjectName(raw) {
  return raw.replace(/^\d+\s+/, '').trim();
}

/** Convert "7:30" or "7:30 hrs" → 7.5 */
export function parseHoursMins(str) {
  if (!str) return 0;
  const cleaned = str.replace(/\s*hrs?\s*/i, '').trim();
  if (!cleaned) return 0;
  // Could be decimal already
  if (!cleaned.includes(':')) {
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  const [h, m] = cleaned.split(':').map(Number);
  return (h || 0) + (m || 0) / 60;
}

/** Naïve CSV/TSV line parser that respects quoted fields. */
export function parseCSVLine(line) {
  const delimiter = line.includes('\t')
    ? '\t'
    : (line.match(/;/g) || []).length > (line.match(/,/g) || []).length
      ? ';'
      : ',';
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/** Parse a full CSV string into an array of arrays. */
function parseCSVRows(text) {
  const source = text.replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] || '';
  const delimiter = firstLine.includes('\t')
    ? '\t'
    : (firstLine.match(/;/g) || []).length >
        (firstLine.match(/,/g) || []).length
      ? ';'
      : ',';
  const rows = [];
  let row = [],
    field = '',
    quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      row.push(field);
      field = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

// ─── Format detection ───────────────────────────────────────────────────

export function detectFormat(text) {
  const firstLine = (
    text.replace(/^\uFEFF/, '').split(/[\r\n]/)[0] || ''
  ).toLowerCase();
  if (firstLine.includes('person') || firstLine.includes('project name'))
    return 'resourcing';
  if (
    firstLine.startsWith('timecode') ||
    firstLine.includes('total logged hours')
  )
    return 'timesheet';
  if (firstLine.includes('startdate') || firstLine.includes('billable hours'))
    return 'summary'; // weekly summary — not supported
  return 'unknown';
}

// ─── Resourcing CSV ─────────────────────────────────────────────────────

/** Match day column headers like "08 Jun M", "09 Jun T" etc.
 *  Returns { colIndex, date, dayOfWeek } */
function parseDayColumns(headers) {
  const dayPattern = /^(\d{1,2})\s+(\w{3})\s+([MTWFS])$/;
  const cols = [];

  for (let i = 0; i < headers.length; i++) {
    const match = headers[i].trim().match(dayPattern);
    if (match) {
      const day = parseInt(match[1], 10);
      const monthIdx = MONTHS[match[2]];
      const dowLetter = match[3];
      if (monthIdx !== undefined) {
        cols.push({ colIndex: i, day, month: monthIdx, dowLetter });
      }
    }
  }
  return cols;
}

/** Infer the year from day columns. Use current year, adjusting if the month
 *  seems to be from the future/past boundary. */
function inferYear(dayCols) {
  if (dayCols.length === 0) return new Date().getFullYear();
  const now = new Date();
  const m = dayCols[0].month;
  // If the month is within ±6 of current, use current year
  let year = now.getFullYear();
  if (m - now.getMonth() > 6) year--;
  if (now.getMonth() - m > 6) year++;
  return year;
}

/** The date of a day column. `year` is the year of the first column; a week
 *  that runs from December into January puts the later columns in the next
 *  year (otherwise 1 Jan would get last year's weekday). */
function columnDate(col, dayCols, year) {
  const wraps = col.month < dayCols[0].month;
  return new Date(year + (wraps ? 1 : 0), col.month, col.day, 12);
}

/** Get the Monday weekKey from the day columns. */
function weekKeyFromDayCols(dayCols, year) {
  // Find the Monday column (dowLetter === 'M')
  const monCol = dayCols.find((c) => c.dowLetter === 'M');
  if (monCol) {
    const d = columnDate(monCol, dayCols, year);
    if (d.getDay() === 1) return toDateStr(d);
  }
  // Fallback: first column, find its Monday
  const first = dayCols[0];
  const d = columnDate(first, dayCols, year);
  // Walk back to Monday
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return toDateStr(d);
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Resolve ambiguous T (Tue vs Thu) using position among day columns. */
function resolveWeekdayIndices(dayCols, year) {
  return [...dayCols]
    .sort((a, b) => a.colIndex - b.colIndex)
    .map((col) => ({
      ...col,
      dayIndex: (columnDate(col, dayCols, year).getDay() + 6) % 7,
    }));
}

export function parseResourcingCSV(text) {
  const rows = parseCSVRows(text);
  if (rows.length < 2) return null;

  const headers = rows[0];
  const projectNameIdx = headers.findIndex(
    (h) => h.trim().toLowerCase() === 'project name',
  );
  if (projectNameIdx === -1) return null;

  const dayCols = parseDayColumns(headers);
  if (dayCols.length === 0) return null;

  const year = inferYear(dayCols);
  const weekKey = weekKeyFromDayCols(dayCols, year);
  const weekdayCols = resolveWeekdayIndices(dayCols, year);

  const projects = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rawName = row[projectNameIdx]?.trim();
    if (!rawName) continue;

    const name = cleanProjectName(rawName);

    // Sum Mon–Fri hours
    let totalResourced = 0;
    const dailyHours = {};
    for (const col of weekdayCols) {
      const val = parseFloat(row[col.colIndex]) || 0;
      if (val > 0) {
        dailyHours[col.dayIndex] = val;
      }
      totalResourced += val;
    }

    // Round to avoid floating point issues
    totalResourced = Math.round(totalResourced * 100) / 100;

    projects.push({
      name,
      resourcedHours: totalResourced,
      dailyHours,
      rawName,
    });
  }

  return { format: 'resourcing', weekKey, projects };
}

// ─── Copy-paste Timesheet ───────────────────────────────────────────────

export function parseTimesheetPaste(text) {
  const rows = parseCSVRows(text);
  if (rows.length < 2) return null;

  const headers = rows[0];

  // Detect day columns: "M01 Jun", "T02 Jun", etc.
  const dayPattern = /^([MTWFS])(\d{2})\s+(\w{3})$/;
  const dayCols = [];
  for (let i = 0; i < headers.length; i++) {
    const match = headers[i].trim().match(dayPattern);
    if (match) {
      const dowLetter = match[1];
      const day = parseInt(match[2], 10);
      const monthIdx = MONTHS[match[3]];
      if (monthIdx !== undefined) {
        dayCols.push({ colIndex: i, day, month: monthIdx, dowLetter });
      }
    }
  }

  const year = inferYear(dayCols);
  const weekKey = dayCols.length > 0 ? weekKeyFromDayCols(dayCols, year) : null;
  const weekdayCols =
    dayCols.length > 0 ? resolveWeekdayIndices(dayCols, year) : [];

  // The "My Total Logged Hours" column
  const totalColIdx = headers.findIndex((h) =>
    h.trim().toLowerCase().includes('total logged hours'),
  );

  // Parse rows
  const projectMap = new Map();
  let currentProject = null;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const firstCell = row[0]?.trim() || '';
    const secondCell = row[1]?.trim() || '';
    const mainCell = firstCell || secondCell;
    if (!mainCell) continue;

    let isTaskRow = false;

    // 1. Check for special CSV separators
    if (/[·ҥ]/.test(mainCell)) {
      isTaskRow = true;
    }
    // 2. CSV format typically leaves the first column empty for task rows
    else if (!firstCell && secondCell) {
      isTaskRow = true;
    }
    // 3. Browser paste: Check if any subsequent column contains a time format
    else {
      for (let i = 1; i < row.length; i++) {
        const val = row[i]?.trim();
        if (val && (/\d+:\d+/.test(val) || /\bhrs\b/i.test(val))) {
          isTaskRow = true;
          break;
        }
      }
    }

    if (!isTaskRow) {
      // It's a Project header row
      let rawName = firstCell;
      if (/[\uFFFD]/.test(firstCell)) {
        const parts = firstCell.split(/[\uFFFD]/).filter(Boolean);
        rawName =
          parts.length > 1
            ? parts.slice(1).join(' - ').trim()
            : parts[0]?.trim() || '';
      }

      const name = cleanProjectName(rawName);
      if (name && name.toLowerCase() !== 'actions') {
        currentProject = name;
        if (!projectMap.has(name)) {
          projectMap.set(name, {
            name,
            totalHours: 0,
            dailyHours: {},
            rawName: firstCell,
          });
        }
      }
    } else if (currentProject) {
      // It's a Task row
      let taskTotal = 0;

      // Look for total hours in the expected column first
      if (totalColIdx >= 0 && row[totalColIdx]) {
        taskTotal = parseHoursMins(row[totalColIdx]);
      }
      if (!taskTotal && totalColIdx >= 0 && row[totalColIdx + 1]) {
        taskTotal = parseHoursMins(row[totalColIdx + 1]);
      }

      // Fallback: Look for "H:MM hrs" pattern anywhere
      if (!taskTotal) {
        for (const cell of row) {
          if (/\d+:\d+\s*hrs?/i.test(cell)) {
            taskTotal = parseHoursMins(cell);
            break;
          }
        }
      }

      const proj = projectMap.get(currentProject);
      if (proj) {
        proj.totalHours = Math.round((proj.totalHours + taskTotal) * 100) / 100;
      }

      // Parse daily values
      for (const col of weekdayCols) {
        let val = row[col.colIndex]?.trim();
        if (
          !val &&
          row[col.colIndex + 1]?.trim() &&
          /\d+:\d+/.test(row[col.colIndex + 1])
        ) {
          val = row[col.colIndex + 1].trim();
        } else if (
          !val &&
          row[col.colIndex - 1]?.trim() &&
          /\d+:\d+/.test(row[col.colIndex - 1])
        ) {
          val = row[col.colIndex - 1].trim();
        }

        if (val) {
          const hours = parseHoursMins(val);
          if (hours > 0) {
            const proj = projectMap.get(currentProject);
            if (proj) {
              proj.dailyHours[col.dayIndex] =
                (proj.dailyHours[col.dayIndex] || 0) + hours;
            }
          }
        }
      }
    }
  }

  return {
    format: 'timesheet',
    weekKey,
    projects: Array.from(projectMap.values()),
  };
}

// ─── Unified parse ──────────────────────────────────────────────────────

export function parseCSV(text) {
  const format = detectFormat(text);
  switch (format) {
    case 'resourcing':
      return parseResourcingCSV(text);
    case 'timesheet':
      return parseTimesheetPaste(text);
    case 'summary':
      return {
        format: 'summary',
        error:
          "Weekly summary CSVs don't contain per-project data. Please use the resourcing export or copy-paste timesheet instead.",
      };
    default:
      return {
        format: 'unknown',
        error:
          'Could not detect the CSV format. Supported formats: Resourcing export, Copy-paste timesheet.',
      };
  }
}
