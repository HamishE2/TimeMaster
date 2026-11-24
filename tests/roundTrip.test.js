// JSON backup round trips: what the app writes must come back unchanged, and
// legacy or damaged backups must load into a valid workspace.
import { describe, expect, it } from 'vitest';
import { migrateBackup } from '../src/lib/utils.js';
import {
  backupPayload,
  workspaceSignature,
} from '../src/lib/backupService.js';

const WEEK = '2026-07-13';
const NEXT = '2026-07-20';

// A workspace already in the app's own shape, touching every persisted field.
const fullWorkspace = () => ({
  schemaVersion: 3,
  projects: [
    {
      id: 'p1',
      name: 'Alpha',
      client: 'Acme',
      code: 'AC-1',
      color: '#123456',
      status: 'active',
      isBillable: true,
      projectType: 'standard',
      resourcedHours: 15.2,
      monthlyResourcedHours: 60.8,
      monthlyAdjustments: { '2026-07': 4.5 },
      historicalMonthlyMonth: '2026-07',
      historicalMonthlyHours: 4.5,
      weeklyOverrides: { [NEXT]: 7.6, '2026-07-27': null },
      monthlyOverrides: { '2026-08-03': 30 },
      frontloads: { [WEEK]: 3.8 },
      hiddenWeeks: ['2026-08-10'],
      hiddenOnwardsFrom: null,
      visibleOnwardsFrom: '2026-07-06',
      archived: false,
      createdAt: '2026-07-01T00:00:00.000Z',
      tasks: [
        { id: 'general', name: 'General' },
        { id: 'docs', name: 'Documentation', custom: 'kept' },
      ],
      entries: { [WEEK]: { 0: 7.6, 1: 3.8 } },
      taskEntries: { docs: { [WEEK]: { 2: 5, 3: 0.25 } } },
      taskRows: { [WEEK]: ['docs'], [NEXT]: ['docs'] },
      notes: {
        general: { [WEEK]: { 0: 'Kick-off  workshop', 1: 'Line one\nline two' } },
        docs: { [WEEK]: { 2: 'QRG and user guide' } },
      },
      budget: 25000,
      hourlyRate: 212.5,
      phaseBudgets: { docs: 4000 },
      activities: [
        { id: 'qrg', name: 'Quick reference guide', amount: 1500 },
        { id: 'ug', name: 'User guide', amount: 2500.5, aliases: ['UG', 'manual'] },
      ],
      activityTags: {
        general: { [WEEK]: { 0: 'none', 1: 'qrg' } },
        docs: { [WEEK]: { 2: { qrg: 3.75, ug: 1.25 }, 3: 'ug' } },
      },
      futureField: { nested: [1, 2, 3] },
    },
  ],
  settings: {
    visibleDays: [0, 1, 2, 3, 4],
    capacityByDay: [7.6, 7.6, 7.6, 7.6, 7.6, 0, 0],
    leaveWeeks: { [WEEK]: [4], [NEXT]: [] },
    theme: 'dark',
    hourlyRate: 180,
    futureSetting: 'kept',
  },
});

// What Export writes, read back the way Open reads it.
const exportAndImport = (workspace) =>
  migrateBackup(
    JSON.parse(
      JSON.stringify(
        backupPayload(workspace.projects, workspace.settings),
        null,
        2,
      ),
    ),
  );

describe('JSON backup round trip', () => {
  it('keeps every field of a full workspace exactly', () => {
    const original = fullWorkspace();
    const loaded = exportAndImport(original);
    expect(loaded.settings).toEqual(original.settings);
    expect(loaded.projects).toEqual(original.projects);
    // And a second trip changes nothing either.
    expect(workspaceSignature(exportAndImport(loaded))).toBe(
      workspaceSignature(loaded),
    );
  });

  it('keeps split activity tags as objects with their shares', () => {
    const [project] = exportAndImport(fullWorkspace()).projects;
    expect(project.activityTags.docs[WEEK][2]).toEqual({ qrg: 3.75, ug: 1.25 });
    expect(project.activityTags.general[WEEK]).toEqual({ 0: 'none', 1: 'qrg' });
  });

  it('keeps finance fields and the workspace rate', () => {
    const { projects, settings } = exportAndImport(fullWorkspace());
    expect(settings.hourlyRate).toBe(180);
    expect(projects[0]).toMatchObject({
      budget: 25000,
      hourlyRate: 212.5,
      phaseBudgets: { docs: 4000 },
    });
    expect(projects[0].activities[1]).toEqual({
      id: 'ug',
      name: 'User guide',
      amount: 2500.5,
      aliases: ['UG', 'manual'],
    });
  });

  it('keeps frontloads, overrides (including explicit unlimited) and leave', () => {
    const { projects, settings } = exportAndImport(fullWorkspace());
    expect(projects[0].frontloads).toEqual({ [WEEK]: 3.8 });
    expect(projects[0].weeklyOverrides).toEqual({
      [NEXT]: 7.6,
      '2026-07-27': null,
    });
    expect(projects[0].monthlyOverrides).toEqual({ '2026-08-03': 30 });
    expect(settings.leaveWeeks).toEqual({ [WEEK]: [4], [NEXT]: [] });
  });

  it('keeps a cleared workspace rate as cleared', () => {
    const workspace = fullWorkspace();
    workspace.settings.hourlyRate = null;
    expect(exportAndImport(workspace).settings.hourlyRate).toBeNull();
  });
});

describe('legacy backups', () => {
  it('convert flat entries and week rows into the current shape', () => {
    const legacy = {
      projects: [
        {
          id: 'old',
          name: '  Legacy  ',
          weeklyAllocation: '10',
          tasks: [
            { id: 'g1', name: 'general' },
            { id: 'build', name: 'Build' },
          ],
        },
      ],
      // Wednesday 15 July 2026 and Sunday 19 July 2026.
      entries: [
        { projectId: 'old', taskId: 'g1', date: '2026-07-15', hours: '2.5' },
        { projectId: 'old', taskId: 'build', date: '2026-07-19', hours: 1 },
        { projectId: 'old', taskId: 'build', date: 'not a date', hours: 4 },
        { projectId: 'other', taskId: 'g1', date: '2026-07-15', hours: 9 },
      ],
      weekRows: { [WEEK]: ['old::build', 'other::x'] },
      settings: { visibleDays: [0, 1, 2, 3, 4] },
    };
    const [project] = migrateBackup(legacy).projects;
    expect(project.name).toBe('Legacy');
    expect(project.resourcedHours).toBe(10);
    expect(project.entries).toEqual({ [WEEK]: { 2: 2.5 } });
    expect(project.taskEntries).toEqual({ build: { [WEEK]: { 6: 1 } } });
    expect(project.taskRows).toEqual({ [WEEK]: ['build'] });
    expect(project.isBillable).toBe(true);
    expect(project.archived).toBe(false);
  });

  it('gives a project without tasks the General task', () => {
    const [project] = migrateBackup({ projects: [{ id: 'x', name: 'X' }] })
      .projects;
    expect(project.tasks).toEqual([{ id: 'general', name: 'General' }]);
  });
});

describe('malformed backups', () => {
  it.each([
    ['null', null],
    ['a string', 'projects'],
    ['no project list', { settings: {} }],
    ['a project object instead of a list', { projects: { id: 'p' } }],
  ])('reject %s with a readable error', (_, raw) => {
    expect(() => migrateBackup(raw)).toThrow(/valid project list/);
  });

  it('drop unusable values without losing the good ones', () => {
    const { projects, settings } = migrateBackup({
      projects: [
        null,
        'junk',
        {
          id: 'p',
          name: 'Kept',
          entries: {
            [WEEK]: { 0: 'NaN', 1: -2, 2: '4', 7: 3, x: 1 },
            [NEXT]: 'bad',
          },
          frontloads: {
            [WEEK]: '2.005',
            '2026-07-14': 3, // not a Monday
            [NEXT]: -1,
          },
          notes: { general: { [WEEK]: { 2: 'ok', 3: 42, 9: 'bad day' } } },
          activities: [{ id: 'a', name: 'A', amount: 'lots' }, { name: '' }],
          activityTags: {
            general: { [WEEK]: { 2: 'a', 0: 'a' } },
            ghost: { [WEEK]: { 2: 'a' } },
          },
          budget: -5,
          hourlyRate: 'abc',
        },
      ],
      settings: {
        visibleDays: 'all',
        capacityByDay: { 0: 8 },
        leaveWeeks: { [WEEK]: [9, 'x', 2, 2] },
        hourlyRate: -10,
      },
    });
    expect(projects).toHaveLength(1);
    const [project] = projects;
    expect(project.entries).toEqual({ [WEEK]: { 2: 4 } });
    expect(project.frontloads).toEqual({ [WEEK]: 2.01 });
    expect(project.notes).toEqual({ general: { [WEEK]: { 2: 'ok' } } });
    expect(project.activities).toEqual([{ id: 'a', name: 'A', amount: null }]);
    // Tags only survive on a known task and a day that has hours.
    expect(project.activityTags).toEqual({ general: { [WEEK]: { 2: 'a' } } });
    expect(project.budget).toBeNull();
    expect(project.hourlyRate).toBeNull();
    expect(settings.visibleDays).toEqual([0, 1, 2, 3, 4]);
    expect(settings.capacityByDay).toEqual([7.6, 7.6, 7.6, 7.6, 7.6, 0, 0]);
    expect(settings.leaveWeeks).toEqual({ [WEEK]: [2] });
    expect(settings.hourlyRate).toBeNull();
  });
});
