import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, test, vi } from 'vitest';
import App from '../src/App.jsx';
import MobileCards from '../src/components/MobileCards.jsx';
import { loadSessionFromIdb } from '../src/lib/idb.js';
import {
  FILE_PERMISSION_CODE,
  backupPayload,
  downloadBlob,
  workspaceSignature,
  writeHandle,
} from '../src/lib/backupService.js';
import { migrateBackup } from '../src/lib/utils.js';

vi.mock('../src/lib/idb.js', () => ({
  loadSessionFromIdb: vi.fn(),
  saveSessionToIdb: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// An in-memory FileSystemFileHandle.
function fakeHandle({ text = '{"projects":[]}', permission = 'granted' } = {}) {
  const state = { text, lastModified: 1, permission, writes: 0 };
  const handle = {
    name: 'TimeMaster.json',
    state,
    queryPermission: vi.fn(async () => state.permission),
    requestPermission: vi.fn(async () => {
      state.permission = 'granted';
      return 'granted';
    }),
    getFile: async () => ({
      name: 'TimeMaster.json',
      lastModified: state.lastModified,
      size: state.text.length,
      text: async () => state.text,
    }),
    createWritable: async () => {
      let pending = '';
      return {
        write: async (value) => {
          pending = value;
        },
        close: async () => {
          state.text = pending;
          state.lastModified += 1;
          state.writes += 1;
        },
      };
    },
  };
  return handle;
}

describe('writeHandle', () => {
  it('does not raise a permission prompt from an autosave', async () => {
    const handle = fakeHandle({ permission: 'prompt' });
    await expect(
      writeHandle(handle, backupPayload([], {}), { interactive: false }),
    ).rejects.toMatchObject({ code: FILE_PERMISSION_CODE });
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(handle.state.writes).toBe(0);
  });

  it('asks for permission when the person clicked save', async () => {
    const handle = fakeHandle({ permission: 'prompt' });
    await writeHandle(handle, backupPayload([], {}));
    expect(handle.requestPermission).toHaveBeenCalledTimes(1);
    expect(handle.state.writes).toBe(1);
  });

  it('writes over a file a sync client changed', async () => {
    // The browser copy is the working copy; the file is replaced whole.
    const handle = fakeHandle();
    await writeHandle(handle, backupPayload([], { theme: 'dark' }));
    handle.state.text = JSON.stringify(backupPayload([], { theme: 'other' }));
    handle.state.lastModified += 50;
    await writeHandle(handle, backupPayload([], { theme: 'light' }));
    expect(JSON.parse(handle.state.text).settings.theme).toBe('light');
  });
});

describe('backup migration', () => {
  const raw = {
    schemaVersion: 3,
    projects: [
      {
        id: 'p1',
        name: 'Alpha',
        extension: { amount: 5000 },
        resourcedHours: '7.6',
        monthlyAdjustments: { '2026-07': '2', '2026-08': 'junk' },
        weeklyOverrides: { '2026-07-13': null, '2026-07-20': 'x', '2026-07-27': 3 },
        tasks: [
          { id: 'general', name: 'General' },
          { id: 't1', name: 'Build', activity: 'Development' },
        ],
        entries: { '2026-07-13': { 0: '7.6', 1: 'abc', 9: 2, 2: -1 } },
        taskEntries: { t1: { '2026-07-13': { 3: 1.5 } } },
        notes: {
          general: { '2026-07-13': { 0: 'Kick-off', 1: '', 2: 4 } },
          t1: 'bad',
        },
      },
    ],
    settings: {
      visibleDays: [4, 0, 0, 2, 9],
      capacityByDay: ['7.6', 'x', 7.6, 7.6, null, 0, 0],
      leaveWeeks: { '2026-07-13': [1, '1', 8] },
      theme: 'dark',
      hourlyRate: 180,
      futureOption: { enabled: true },
    },
  };

  it('keeps unknown settings and project fields while validating known ones', () => {
    const { projects, settings } = migrateBackup(raw);
    expect(settings.hourlyRate).toBe(180);
    expect(settings.futureOption).toEqual({ enabled: true });
    expect(settings.visibleDays).toEqual([0, 2, 4]);
    expect(settings.capacityByDay).toEqual([7.6, 7.6, 7.6, 7.6, 7.6, 0, 0]);
    expect(settings.leaveWeeks['2026-07-13']).toEqual([1]);
    const [project] = projects;
    expect(project.extension).toEqual({ amount: 5000 });
    expect(project.tasks[1].activity).toBe('Development');
    expect(project.resourcedHours).toBe(7.6);
    expect(project.monthlyAdjustments).toEqual({ '2026-07': 2 });
    expect(project.weeklyOverrides).toEqual({
      '2026-07-13': null,
      '2026-07-27': 3,
    });
    expect(project.entries).toEqual({ '2026-07-13': { 0: 7.6 } });
    expect(project.notes).toEqual({
      general: { '2026-07-13': { 0: 'Kick-off' } },
    });
  });

  it('round-trips through a JSON backup without changing the workspace', () => {
    const once = migrateBackup(raw);
    const file = JSON.parse(
      JSON.stringify(backupPayload(once.projects, once.settings)),
    );
    expect(workspaceSignature(migrateBackup(file))).toBe(
      workspaceSignature(once),
    );
  });
});

test('download fallback attaches the link and keeps the blob URL alive', () => {
  vi.useFakeTimers();
  const created = [];
  URL.createObjectURL = vi.fn(() => 'blob:test');
  URL.revokeObjectURL = vi.fn();
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function () {
      created.push(this.isConnected);
    });
  downloadBlob(new Blob(['{}']), 'TimeMaster.json');
  expect(click).toHaveBeenCalledTimes(1);
  expect(created).toEqual([true]);
  vi.advanceTimersByTime(1000);
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60000);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  vi.useRealTimers();
});

test('a phone card at its exact weekly allowance is not marked over', () => {
  const project = {
    id: 'p1',
    name: 'Float',
    resourcedHours: 0.3,
    entries: { '2026-07-13': { 0: 0.1, 1: 0.2 } },
    tasks: [{ id: 'general', name: 'General' }],
  };
  const { container } = render(
    <MobileCards
      projects={[project]}
      category="none"
      week="2026-07-13"
      days={[0, 1, 2, 3, 4]}
      leave={[]}
      leaveWeeks={{}}
      onEntry={() => {}}
      onTaskEntry={() => {}}
      onAddLine={() => {}}
      onRemoveTaskLine={() => {}}
      onEdit={() => {}}
      onFrontload={() => {}}
    />,
  );
  expect(container.querySelector('.phone-meter').className).not.toContain(
    'over',
  );
});

test('autosave pauses for permission instead of hanging, and Save now resumes it', async () => {
  const data = migrateBackup({
    projects: [{ id: 'p1', name: 'Alpha', resourcedHours: 8 }],
    settings: {},
  });
  const handle = fakeHandle({
    text: JSON.stringify(backupPayload([], {})),
    permission: 'prompt',
  });
  loadSessionFromIdb.mockResolvedValue({
    fileHandle: handle,
    weekKey: '2026-07-13',
    data: backupPayload(data.projects, data.settings),

    // The file holds an older workspace, so the restored one needs saving.
    savedSignature: workspaceSignature(backupPayload([], {})),
  });
  render(<App />);
  expect(
    await screen.findByText('Save paused · allow access', {}, { timeout: 3000 }),
  ).toBeTruthy();
  expect(screen.queryByText('Saving…')).toBeNull();
  expect(handle.requestPermission).not.toHaveBeenCalled();

  fireEvent.click(screen.getByTitle('Open file controls'));
  fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
  await waitFor(() => expect(handle.state.writes).toBe(1));
  expect(handle.requestPermission).toHaveBeenCalledTimes(1);
  expect(JSON.parse(handle.state.text).projects[0].name).toBe('Alpha');
  await waitFor(() =>
    expect(screen.queryByText('Save paused · allow access')).toBeNull(),
  );
});
