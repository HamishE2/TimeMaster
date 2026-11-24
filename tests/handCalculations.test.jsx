// Calculations checked against numbers worked out by hand (in the comments),
// not against the helpers themselves.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.jsx';
import { loadSessionFromIdb } from '../src/lib/idb.js';
import {
  capacityFor,
  frontloadLimit,
  monthlyAllowance,
  projectMetrics,
  weeklyResourcedHours,
} from '../src/lib/utils.js';
import {
  developmentEntryUpdates,
  timesheetTotals,
} from '../src/lib/timesheet.js';
import { weekIsComplete } from '../src/lib/weekGoal.js';

vi.mock('../src/lib/idb.js', () => ({
  loadSessionFromIdb: vi.fn(),
  saveSessionToIdb: vi.fn().mockResolvedValue(undefined),
}));
afterEach(cleanup);

const W1 = '2026-07-13'; // Mon 13 Jul 2026
const W2 = '2026-07-20';
const W3 = '2026-07-27'; // Thu 30 Jul: a July week ending Sun 2 Aug
const W0 = '2026-06-29'; // Mon 29 Jun, Thu 2 Jul: a July week starting in June
const settings = (leaveWeeks = {}) => ({
  visibleDays: [0, 1, 2, 3, 4],
  capacityByDay: [7.6, 7.6, 7.6, 7.6, 7.6, 0, 0],
  leaveWeeks,
});
const close = (value, expected) => expect(value).toBeCloseTo(expected, 9);

describe('capacity', () => {
  it('is 38h for five 7.6h days and drops by a day per leave day', () => {
    close(capacityFor(W1, settings()), 38);
    close(capacityFor(W1, settings({ [W1]: [4] })), 30.4); // 4 × 7.6
    close(capacityFor(W1, settings({ [W1]: [2, 4] })), 22.8); // 3 × 7.6
    // Leave on a day outside the working week changes nothing.
    close(capacityFor(W1, settings({ [W1]: [5] })), 38);
  });
});

describe('a 7.6h day and a 38h week', () => {
  // 7.6 split as 2.3 + 5.3 and 0.1 + 0.2 + 7.3 carries float noise.
  const projects = [
    {
      id: 'a',
      name: 'A',
      resourcedHours: 22.8,
      isBillable: true,
      entries: { [W1]: { 0: 2.3, 1: 0.1, 2: 7.6, 3: 7.6 } },
    },
    {
      id: 'b',
      name: 'B',
      resourcedHours: 15.2,
      isBillable: false,
      entries: { [W1]: { 0: 5.3, 1: 0.2, 4: 7.6 } },
    },
    {
      id: 'c',
      name: 'C',
      resourcedHours: null,
      isBillable: true,
      entries: { [W1]: { 1: 7.3 } },
    },
  ];
  // A: 2.3 + 0.1 + 7.6 + 7.6 = 17.6   B: 5.3 + 0.2 + 7.6 = 13.1   C: 7.3
  // Week: 38.0. Billable: A + C = 24.9 → 24.9 / 38 = 65.526…%

  it('is exactly at capacity, not over', () => {
    const totals = timesheetTotals(projects, W1, settings(), []);
    close(totals.logged, 38);
    close(totals.capacity, 38);
    expect(Math.abs(totals.remaining)).toBeLessThan(0.01);
    close(totals.billable, 24.9);
    close(totals.billablePct, (24.9 / 38) * 100);
    close(totals.planned, 38); // 22.8 + 15.2, C is unlimited
    expect(totals.over).toBe(0);
  });

  it('shows no over-capacity day or week in the timesheet', async () => {
    loadSessionFromIdb.mockResolvedValue({
      weekKey: W1,
      data: { schemaVersion: 3, projects, settings: settings() },
    });
    const { container } = render(<App />);
    await screen.findByTitle('Open file controls');
    const footer = container.querySelector('tfoot');
    expect(footer.querySelectorAll('.over')).toHaveLength(0);
    expect(footer.textContent).toContain('0h free');
    // Every day reads 7.6h against a 7.6h target.
    expect(footer.textContent.match(/100% of 7\.6h/g)).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Fill remaining' }).disabled).toBe(
      true,
    );
  });

  it('counts a project logged to exactly its plan as at, not over', () => {
    const project = {
      id: 'p',
      resourcedHours: 7.6,
      entries: { [W1]: { 0: 2.3, 1: 5.3 } },
    };
    expect(projectMetrics(project, W1).status).toBe('at');
  });
});

describe('billable share and the weekly goal', () => {
  it('is 80% when 30.4h of 38h are billable, which completes the week', () => {
    const projects = [
      { id: 'a', isBillable: true, entries: { [W1]: { 0: 7.6, 1: 7.6, 2: 7.6, 3: 7.6 } } },
      { id: 'b', isBillable: false, entries: { [W1]: { 4: 7.6 } } },
    ];
    const totals = timesheetTotals(projects, W1, settings(), []);
    close(totals.billablePct, 80);
    expect(weekIsComplete(totals)).toBe(true);
    // 0.01h short of 80% billable is not complete.
    projects[0].entries[W1][3] = 7.59;
    projects[1].entries[W1][3] = 0.01;
    expect(weekIsComplete(timesheetTotals(projects, W1, settings(), []))).toBe(
      false,
    );
  });

  it('is 0, not NaN, for an empty week', () => {
    expect(timesheetTotals([], W1, settings(), []).billablePct).toBe(0);
  });
});

describe('allowance, remaining and frontloading', () => {
  it('plan 20h with 22h logged is 2h over; borrowing 2h makes it exactly at', () => {
    const project = {
      id: 'p',
      resourcedHours: 20,
      entries: { [W1]: { 0: 8, 1: 8, 2: 6 } },
    };
    let m = projectMetrics(project, W1);
    expect([m.plan, m.weeklyAllowance, m.logged, m.remaining, m.status]).toEqual(
      [20, 20, 22, -2, 'over'],
    );
    project.frontloads = { [W1]: 2 };
    m = projectMetrics(project, W1);
    expect([m.weeklyAllowance, m.remaining, m.status]).toEqual([22, 0, 'at']);
    // The 2h come out of the following week: 20 − 2 = 18.
    expect(projectMetrics(project, W2).weeklyAllowance).toBe(18);
  });

  it('chains: W1 borrows 2h from W2, which borrows 3h from W3', () => {
    const project = {
      id: 'p',
      resourcedHours: 20,
      frontloads: { [W1]: 2, [W2]: 3 },
    };
    expect(projectMetrics(project, W1).weeklyAllowance).toBe(22); // 20 + 2
    expect(projectMetrics(project, W2).weeklyAllowance).toBe(21); // 20 + 3 − 2
    expect(projectMetrics(project, W3).weeklyAllowance).toBe(17); // 20 − 3
    // W1 may borrow up to W2's plan plus what W2 itself borrows: 20 + 3.
    expect(frontloadLimit(project, W1)).toBe(23);
    // Over the three weeks the total allowance is unchanged: 60h.
    expect(
      [W1, W2, W3].reduce(
        (n, wk) => n + projectMetrics(project, wk).weeklyAllowance,
        0,
      ),
    ).toBe(60);
  });

  it('flags over caused by lending ahead', () => {
    const project = {
      id: 'p',
      resourcedHours: 10,
      frontloads: { [W1]: 4 },
      entries: { [W2]: { 0: 8 } },
    };
    // W2: 10 − 4 = 6h allowance, 8h logged → 2h over, due to frontloading.
    const m = projectMetrics(project, W2);
    expect([m.weeklyAllowance, m.remaining, m.overDueToFrontloading]).toEqual([
      6,
      -2,
      true,
    ]);
  });

  it('leave days do not count towards logged hours', () => {
    const project = {
      id: 'p',
      resourcedHours: 10,
      entries: { [W1]: { 0: 4, 4: 6 } },
      taskEntries: { t: { [W1]: { 4: 1, 1: 2 } } },
      tasks: [
        { id: 'general', name: 'General' },
        { id: 't', name: 'Phase' },
      ],
    };
    // Friday is leave: 4 (Mon) + 2 (Tue phase) = 6.
    const m = projectMetrics(project, W1, { [W1]: [4] });
    expect([m.logged, m.remaining]).toEqual([6, 4]);
  });
});

describe('monthly allowance across month boundaries', () => {
  // 40h a month, no weekly plan. Hours count towards the calendar month they
  // were worked in; a week's allowance month is the month of its Thursday.
  //   Mon 29 Jun 4h (June) · Thu 2 Jul 6h          → week W0 (July)
  //   Mon 13 Jul 8h                                → week W1 (July)
  //   Mon 27 Jul 5h · Sat 1 Aug 2h (August)        → week W3 (July)
  // July hours: 6 + 8 + 5 = 19, so 40 − 19 = 21h of July remain.
  const project = () => ({
    id: 'm',
    resourcedHours: null,
    monthlyResourcedHours: 40,
    entries: {
      [W0]: { 0: 4, 3: 6 },
      [W1]: { 0: 8 },
      [W3]: { 0: 5, 5: 2 },
    },
  });

  it('leaves the same July remainder in every July week', () => {
    for (const [week, logged] of [
      [W0, 10],
      [W1, 8],
      [W3, 7],
    ]) {
      const m = projectMetrics(project(), week);
      expect(m.logged).toBe(logged);
      expect(m.effective).toBe(21 + logged);
      expect(m.remaining).toBe(21);
      expect(m.status).toBe('under');
    }
  });

  it('subtracts historical hours entered for July only', () => {
    const p = { ...project(), monthlyAdjustments: { '2026-07': 10 } };
    expect(projectMetrics(p, W1).remaining).toBe(11); // 40 − 19 − 10
    // August (W 3 Aug, Thu 6 Aug): only Sat 1 Aug's 2h count → 38.
    expect(projectMetrics(p, '2026-08-03').remaining).toBe(38);
  });

  it('is capped by the weekly plan when that is lower', () => {
    const p = { ...project(), resourcedHours: 10 };
    // Weekly 10 − 8 = 2 is below the monthly 21.
    expect(projectMetrics(p, W1).remaining).toBe(2);
  });

  it('ignores hours logged on leave', () => {
    // Leave on Mon 13 Jul: July hours fall to 11, so 29h remain.
    expect(monthlyAllowance(project(), W1, { [W1]: [0] })).toBe(29);
    expect(projectMetrics(project(), W1, { [W1]: [0] }).remaining).toBe(29);
  });

  it('never goes below zero', () => {
    const p = { ...project(), monthlyResourcedHours: 15 };
    // 15 − 19 + 8 = 4 for W1: 8h logged against 4h → 4h over.
    const m = projectMetrics(p, W1);
    expect([m.monthly, m.remaining, m.status]).toEqual([4, -4, 'over']);
    expect(projectMetrics({ ...p, monthlyResourcedHours: 1 }, W1).monthly).toBe(
      0,
    );
  });
});

describe('weekly resourced hours', () => {
  it('adds each allowance, borrowed hours included, and floors lent-out weeks at 0', () => {
    const projects = [
      { id: 'a', resourcedHours: 20, frontloads: { [W1]: 2 } }, // 22
      { id: 'b', resourcedHours: null }, // unlimited: 0
      { id: 'c', resourcedHours: 5, frontloads: { '2026-07-06': 8 } }, // 5 − 8 → 0
      { id: 'd', resourcedHours: 10, weeklyOverrides: { [W1]: 0.5 } }, // 0.5
    ];
    close(weeklyResourcedHours(projects, W1), 22.5);
    const totals = timesheetTotals(projects, W1, settings(), []);
    close(totals.resourced, 22.5);
    close(totals.resourcingCapacity, 0.3); // 22.8 − 22.5
    close(totals.frontloading, 10); // 2 in to A, 8 out of C
  });
});

describe('Fill remaining', () => {
  it('tops each working day up to 7.6h, skipping leave and full days', () => {
    // Friday is leave: capacity 30.4.
    const a = { id: 'a', entries: { [W1]: { 0: 7.6, 1: 2.3, 2: 3.25 } } };
    const b = { id: 'b', entries: { [W1]: { 1: 5.3 } } };
    const pd = { id: 'pd', entries: { [W1]: { 2: 1 } } };
    const visible = [a, b, pd];
    const totals = timesheetTotals(visible, W1, settings({ [W1]: [4] }), [4]);
    // Logged 7.6 + 7.6 + 4.25 = 19.45 → 30.4 − 19.45 = 10.95 remain.
    close(totals.remaining, 10.95);
    const updates = developmentEntryUpdates(
      pd,
      W1,
      [0, 1, 2, 3, 4],
      [4],
      visible,
      settings({ [W1]: [4] }),
      totals.remaining,
    );
    // Wed: 7.6 − 4.25 = 3.35 more (1 → 4.35). Thu: 7.6. Mon/Tue full, Fri leave.
    expect(updates).toEqual({ 2: 4.35, 3: 7.6 });
  });

  it('stops when the week is full even if a day has room', () => {
    // Mon has 9h (1.4h over the day). 38 − 9 = 29h remain for Tue–Fri.
    const a = { id: 'a', entries: { [W1]: { 0: 9 } } };
    const pd = { id: 'pd', entries: {} };
    const updates = developmentEntryUpdates(
      pd,
      W1,
      [0, 1, 2, 3, 4],
      [],
      [a, pd],
      settings(),
      29,
    );
    // 7.6 + 7.6 + 7.6 + 6.2 = 29.
    expect(updates).toEqual({ 1: 7.6, 2: 7.6, 3: 7.6, 4: 6.2 });
  });
});
