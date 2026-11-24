/* global process */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  capacityFor,
  dateString,
  historicalHoursForWeek,
  monthKey,
  monthlyAllowance,
  projectMetrics,
  weekKeyFor,
} from '../src/lib/utils.js';
import {
  createProjectRecord,
  editProjectRecord,
} from '../src/lib/projectOperations.js';
import { developmentEntryUpdates } from '../src/lib/timesheet.js';
import { parseCSV } from '../src/lib/csvParser.js';

const fields = {
  name: 'Alpha',
  hours: 8,
  isBillable: true,
  monthly: 20,
  historical: 5,
  client: '',
  code: '',
  status: 'active',
  color: '#000',
};

describe('date keys', () => {
  const zone = process.env.TZ;
  afterEach(() => {
    process.env.TZ = zone;
  });

  it('read YYYY-MM-DD strings as local dates west of Greenwich', () => {
    process.env.TZ = 'America/New_York';
    expect(dateString('2026-03-02')).toBe('2026-03-02');
    expect(monthKey('2026-03-01')).toBe('2026-03');
    expect(weekKeyFor('2026-03-02')).toBe('2026-03-02');
  });
});

describe('monthly historical hours', () => {
  // Mon 28 Sep 2026 – Sun 4 Oct 2026: the allowance month is October.
  const week = '2026-09-28';

  it('are stored against the month the week’s allowance uses', () => {
    const project = createProjectRecord(fields, 'onwards', week, 'p1', 'now');
    expect(project.monthlyAdjustments).toEqual({ '2026-10': 5 });
    expect(monthlyAllowance(project, week, {})).toBe(15);
    const edited = editProjectRecord(
      project,
      { ...fields, historical: 2 },
      'project',
      week,
    );
    expect(edited.monthlyAdjustments['2026-10']).toBe(2);
    expect(monthlyAllowance(edited, week, {})).toBe(18);
  });

  it('do not carry one month’s value into the next month’s editor', () => {
    const project = createProjectRecord(
      fields,
      'onwards',
      '2026-07-13',
      'p1',
      'now',
    );
    expect(historicalHoursForWeek(project, '2026-07-13')).toBe(5);
    expect(historicalHoursForWeek(project, '2026-08-10')).toBe('');
  });
});

describe('invalid stored numbers', () => {
  it('never turn totals into NaN', () => {
    const project = {
      id: 'p1',
      resourcedHours: 8,
      monthlyResourcedHours: 'abc',
      monthlyAdjustments: { '2026-07': 'x' },
      entries: { '2026-07-13': { 0: 'abc', 1: 2 } },
    };
    const metrics = projectMetrics(project, '2026-07-13', {});
    expect(metrics.logged).toBe(2);
    expect(metrics.monthly).toBeNull();
    expect(metrics.remaining).toBe(6);
    expect(
      capacityFor('2026-07-13', { capacityByDay: ['7.6', 'x', 7.6, 7.6, 7.6] }),
    ).toBeCloseTo(30.4);
  });

  it('treat a cleared weekly plan as unlimited, not zero', () => {
    const metrics = projectMetrics(
      { id: 'p1', resourcedHours: '', entries: {} },
      '2026-07-13',
      {},
    );
    expect(metrics.status).toBe('unlimited');
  });
});

describe('Fill remaining', () => {
  it('tops days up to capacity without writing float noise (7.6 - 0.2)', () => {
    const other = {
      id: 'o',
      entries: { '2026-07-13': { 0: 0.2, 1: 7.6, 2: 1 } },
    };
    const pd = { id: 'pd', entries: {} };
    const updates = developmentEntryUpdates(
      pd,
      '2026-07-13',
      [0, 1, 2],
      [],
      [other, pd],
      { capacityByDay: [7.6, 7.6, 7.6, 7.6, 7.6, 0, 0] },
      30,
    );
    expect(updates).toEqual({ 0: 7.4, 2: 6.6 });
  });
});

describe('ProjectWorks CSV across New Year', () => {
  afterEach(() => vi.useRealTimers());

  it('gives January columns their own year’s weekday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-20T12:00:00'));
    const result = parseCSV(
      [
        'Project Name,28 Dec M,29 Dec T,30 Dec W,31 Dec T,01 Jan F',
        'Alpha,1,2,3,4,5',
      ].join('\n'),
    );
    expect(result.weekKey).toBe('2026-12-28');
    expect(result.projects[0].dailyHours).toEqual({
      0: 1,
      1: 2,
      2: 3,
      3: 4,
      4: 5,
    });
  });
});
