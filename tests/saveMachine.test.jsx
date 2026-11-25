// Adversarial tests for the attached-file save state machine in App.
// Each test drives App through an interleaving that used to (or could) leave
// the status stuck on "Saving…" or drop an edit, using in-memory file handles
// whose writes can be held, failed, or landed late.
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../src/App.jsx';
import { loadSessionFromIdb, saveSessionToIdb } from '../src/lib/idb.js';
import {
  FileUnresponsiveError,
  backupPayload,
  workspaceSignature,
  writeHandle,
} from '../src/lib/backupService.js';
import { createProjectRecord } from '../src/lib/projectOperations.js';

vi.mock('../src/lib/idb.js', () => ({
  loadSessionFromIdb: vi.fn(),
  saveSessionToIdb: vi.fn().mockResolvedValue(undefined),
}));

// These drive real 800ms autosave timers; leave headroom on slow runners.
vi.setConfig({ testTimeout: 20000 });

const WEEK = '2026-07-13';

const baseWorkspace = () => ({
  schemaVersion: 3,
  projects: [
    {
      id: 'p1',
      name: 'Alpha',
      resourcedHours: 38,
      isBillable: true,
      tasks: [{ id: 'general', name: 'General' }],
      entries: {},
      archived: false,
    },
  ],
  settings: {
    visibleDays: [0, 1, 2, 3, 4],
    capacityByDay: [7.6, 7.6, 7.6, 7.6, 7.6, 0, 0],
    leaveWeeks: {},
    theme: 'system',
  },
});

// An in-memory FileSystemFileHandle whose writes can be held open, failed,
// or made to land after reporting a failure.
function controlledHandle(name, workspace = baseWorkspace()) {
  const state = {
    text: JSON.stringify(backupPayload(workspace.projects, workspace.settings)),
    lastModified: 1000,
    permission: 'granted',
    grant: 'granted',
    writes: 0,
    hold: false,
    held: [],
    fail: null,
  };
  const land = (text) => {
    state.text = text;
    state.lastModified += 1;
    state.writes += 1;
  };
  const handle = {
    name,
    kind: 'file',
    state,
    queryPermission: vi.fn(async () => state.permission),
    requestPermission: vi.fn(async () => {
      state.permission = state.grant;
      return state.permission;
    }),
    getFile: async () => {
      const text = state.text,
        lastModified = state.lastModified;
      return { name, lastModified, size: text.length, text: async () => text };
    },
    createWritable: async () => {
      let pending = '';
      return {
        write: async (value) => {
          pending = value;
        },
        close: async () => {
          if (state.hold) await new Promise((resolve) => state.held.push(resolve));
          const fail = state.fail;
          if (fail) {
            state.fail = null;
            if (fail.landNow) land(pending);
            // A late landing: the caller is told it failed, but the write
            // still reaches the file when the test releases it.
            if (fail.landLater) fail.landLater.push(() => land(pending));
            throw fail.error;
          }
          land(pending);
        },
        abort: async () => {},
      };
    },
  };
  return handle;
}

const fileData = (handle) => JSON.parse(handle.state.text);
const statusText = () =>
  screen.getByTitle('Open file controls').querySelector('span').textContent;
const cell = (container, day, project = 'p1') =>
  container.querySelector(`input[data-entry="${project}||${day}"]`);
const typeHours = (container, day, value, project = 'p1') => {
  const input = cell(container, day, project);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: String(value) } });
  fireEvent.blur(input);
};
const releaseHeld = (handle) => {
  handle.state.hold = false;
  handle.state.held.splice(0).forEach((resolve) => resolve());
};
const openFilePanel = () =>
  fireEvent.click(screen.getByTitle('Open file controls'));
const closeFilePanel = () => {
  const close = screen.queryByRole('button', { name: /close/i });
  if (close) fireEvent.click(close);
};
const savedStatus = async (timeout = 4000) =>
  waitFor(() => expect(statusText()).toMatch(/^Saved /), { timeout });

// Restores a session attached to `handle` whose file already holds `workspace`.
async function renderAttached(handle, workspace = baseWorkspace()) {
  const payload = backupPayload(workspace.projects, workspace.settings);
  const file = await handle.getFile();
  loadSessionFromIdb.mockResolvedValue({
    fileHandle: handle,
    weekKey: WEEK,
    data: payload,
    fileRevision: {
      name: handle.name,
      lastModified: file.lastModified,
      size: file.size,
      // Matches backupService's FNV-1a revision hash of the file text.
      contentHash: fnv(await file.text()),
    },
    savedSignature: workspaceSignature(payload),
  });
  const view = render(<App />);
  await screen.findByTitle('Open file controls');
  return view;
}

function fnv(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

let pickers;
beforeEach(() => {
  pickers = { save: [], open: [] };
  window.showSaveFilePicker = vi.fn(async () => pickers.save.shift());
  window.showOpenFilePicker = vi.fn(async () => [pickers.open.shift()]);
  saveSessionToIdb.mockReset();
  saveSessionToIdb.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  delete window.showSaveFilePicker;
  delete window.showOpenFilePicker;
});

test('a file restored from the browser copy is not dirty just because migration filled defaults', async () => {
  // Projects created in the app have no `archived` field until migration adds
  // archived: false, so the restored workspace's signature used to differ from
  // the saved one and every reload rewrote the file (or, without permission,
  // showed "Save paused" although nothing had changed).
  const project = createProjectRecord(
    {
      name: 'Fresh',
      hours: 10,
      isBillable: true,
      monthly: null,
      historical: 0,
      client: '',
      code: '',
      status: 'active',
      color: '#7aa600',
    },
    'project',
    WEEK,
    'fresh',
    '2026-07-01T00:00:00.000Z',
  );
  const workspace = { ...baseWorkspace(), projects: [project] };
  expect('archived' in project).toBe(false);
  const handle = controlledHandle('TimeMaster.json', workspace);
  handle.state.permission = 'prompt';
  await renderAttached(handle, workspace);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  expect(statusText()).toMatch(/^Saved /);
  expect(handle.state.writes).toBe(0);
});

test('autosave during a manual save: both edits land and the status settles', async () => {
  const handle = controlledHandle('TimeMaster.json');
  const { container } = await renderAttached(handle);
  handle.state.hold = true;
  typeHours(container, 0, 1);
  await waitFor(() => expect(statusText()).toBe('Saving…'), { timeout: 3000 });
  typeHours(container, 1, 2);
  openFilePanel();
  fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
  // Let the debounced autosave fire too while the first write is held.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  expect(statusText()).toBe('Saving…');
  releaseHeld(handle);
  await savedStatus();
  expect(fileData(handle).projects[0].entries[WEEK]).toEqual({ 0: 1, 1: 2 });
});

test('Save As while an autosave is writing attaches the new file and keeps every edit', async () => {
  const first = controlledHandle('First.json');
  const second = controlledHandle('Second.json', { projects: [], settings: {} });
  const { container } = await renderAttached(first);
  first.state.hold = true;
  typeHours(container, 0, 3);
  await waitFor(() => expect(statusText()).toBe('Saving…'), { timeout: 3000 });
  pickers.save.push(second);
  openFilePanel();
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: /Create new TimeMaster.json/ }),
    );
  });
  await waitFor(() => expect(second.state.writes).toBe(1));
  expect(fileData(second).projects[0].entries[WEEK]).toEqual({ 0: 3 });
  releaseHeld(first);
  await savedStatus();
  expect(screen.getByTitle('Open file controls').textContent).toContain(
    'Second.json',
  );
  closeFilePanel();
  typeHours(container, 1, 4);
  await waitFor(() => expect(second.state.writes).toBe(2), { timeout: 3000 });
  await savedStatus();
  expect(fileData(second).projects[0].entries[WEEK]).toEqual({ 0: 3, 1: 4 });
  // The old file only ever received the write that was in flight.
  expect(first.state.writes).toBe(1);
});

test('opening a different file mid-save shows that file and later edits go to it', async () => {
  const first = controlledHandle('First.json');
  const other = baseWorkspace();
  other.projects[0].entries = { [WEEK]: { 4: 6 } };
  const second = controlledHandle('Second.json', other);
  const { container } = await renderAttached(first);
  first.state.hold = true;
  typeHours(container, 0, 5);
  await waitFor(() => expect(statusText()).toBe('Saving…'), { timeout: 3000 });
  pickers.open.push(second);
  openFilePanel();
  fireEvent.click(screen.getByRole('button', { name: /Choose existing JSON/ }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Replace workspace' }));
  });
  await waitFor(() =>
    expect(screen.getByTitle('Open file controls').textContent).toContain(
      'Second.json',
    ),
  );
  releaseHeld(first);
  await savedStatus();
  // The first file still got the edit that was being written to it.
  expect(fileData(first).projects[0].entries[WEEK]).toEqual({ 0: 5 });
  expect(cell(container, 4).value).toBe('6');
  typeHours(container, 2, 1.5);
  await waitFor(() => expect(second.state.writes).toBe(1), { timeout: 3000 });
  await savedStatus();
  expect(fileData(second).projects[0].entries[WEEK]).toEqual({ 2: 1.5, 4: 6 });
  expect(first.state.writes).toBe(1);
});

test('a revoked permission pauses autosave, keeps edits, and Save now writes the latest', async () => {
  const handle = controlledHandle('TimeMaster.json');
  const { container } = await renderAttached(handle);
  typeHours(container, 0, 2);
  await savedStatus();
  handle.state.permission = 'prompt';
  typeHours(container, 1, 3);
  await waitFor(
    () => expect(statusText()).toBe('Save paused · allow access'),
    { timeout: 3000 },
  );
  typeHours(container, 2, 4);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  expect(statusText()).toBe('Save paused · allow access');
  expect(handle.state.writes).toBe(1);
  // The person refuses first, then allows.
  handle.state.grant = 'denied';
  openFilePanel();
  fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
  await waitFor(() => expect(statusText()).toBe('Save needs attention'));
  handle.state.grant = 'granted';
  fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
  await savedStatus();
  expect(fileData(handle).projects[0].entries[WEEK]).toEqual({
    0: 2,
    1: 3,
    2: 4,
  });
});

test('hiding the tab writes pending edits straight away', async () => {
  const handle = controlledHandle('TimeMaster.json');
  const { container } = await renderAttached(handle);
  typeHours(container, 0, 7.6);
  const original = Object.getOwnPropertyDescriptor(
    Document.prototype,
    'visibilityState',
  );
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  });
  try {
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Well inside the 800ms autosave delay.
    await waitFor(() => expect(handle.state.writes).toBe(1), { timeout: 300 });
  } finally {
    delete document.visibilityState;
    if (original)
      Object.defineProperty(Document.prototype, 'visibilityState', original);
  }
  await savedStatus();
  expect(fileData(handle).projects[0].entries[WEEK]).toEqual({ 0: 7.6 });
});

test('a write that timed out but landed is recognised as ours on the next save', async () => {
  const handle = controlledHandle('TimeMaster.json');
  const { container } = await renderAttached(handle);
  handle.state.fail = {
    error: new FileUnresponsiveError(handle.name),
    landNow: true,
  };
  typeHours(container, 0, 1);
  await waitFor(() => expect(statusText()).toBe('Save needs attention'), {
    timeout: 3000,
  });
  typeHours(container, 1, 2);
  await savedStatus();
  expect(statusText()).not.toBe('Save blocked · file changed');
  expect(fileData(handle).projects[0].entries[WEEK]).toEqual({ 0: 1, 1: 2 });
});

test('a write the browser never finishes does not block later saves', async () => {
  // A stuck write used to hold back every later save to the file, even
  // through a reattached handle, until the tab was reloaded.
  const handle = controlledHandle('TimeMaster.json');
  const one = baseWorkspace();
  one.projects[0].entries = { [WEEK]: { 0: 1 } };
  const two = baseWorkspace();
  two.projects[0].entries = { [WEEK]: { 0: 1, 1: 2 } };
  handle.state.hold = true;
  await expect(
    writeHandle(handle, backupPayload(one.projects, one.settings), {
      timeoutMs: 30,
    }),
  ).rejects.toBeInstanceOf(FileUnresponsiveError);
  handle.state.hold = false;
  await writeHandle(handle, backupPayload(two.projects, two.settings), {
    timeoutMs: 30,
  });
  expect(fileData(handle).projects[0].entries[WEEK]).toEqual({ 0: 1, 1: 2 });
});

test('quota failures in the file and the browser copy settle as errors', async () => {
  const handle = controlledHandle('TimeMaster.json');
  const { container } = await renderAttached(handle);
  saveSessionToIdb.mockRejectedValue(
    new DOMException('Quota exceeded', 'QuotaExceededError'),
  );
  handle.state.fail = {
    error: new DOMException('Quota exceeded', 'QuotaExceededError'),
  };
  typeHours(container, 0, 1);
  await waitFor(() => expect(statusText()).toBe('Save needs attention'), {
    timeout: 3000,
  });
  expect(
    screen.getAllByText(/could not be saved|Quota exceeded/).length,
  ).toBeGreaterThan(0);
  // Space is freed: the next edit saves both.
  saveSessionToIdb.mockResolvedValue(undefined);
  typeHours(container, 1, 2);
  await savedStatus();
  expect(fileData(handle).projects[0].entries[WEEK]).toEqual({ 0: 1, 1: 2 });
});

test('a very large workspace saves, settles, and round-trips', async () => {
  const workspace = baseWorkspace();
  const weeks = Array.from({ length: 104 }, (_, i) => {
    const d = new Date(2025, 0, 6 + i * 7, 12);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  for (let i = 0; i < 120; i += 1)
    workspace.projects.push({
      id: `bulk-${i}`,
      name: `Bulk ${i}`,
      resourcedHours: 1,
      archived: true,
      tasks: [{ id: 'general', name: 'General' }],
      entries: Object.fromEntries(
        weeks.map((week) => [week, { 0: 1.25, 1: 0.5, 2: 2, 3: 0.75, 4: 1 }]),
      ),
      notes: {
        general: Object.fromEntries(weeks.map((week) => [week, { 0: `n ${i}` }])),
      },
    });
  const handle = controlledHandle('Big.json', workspace);
  expect(handle.state.text.length).toBeGreaterThan(1_000_000);
  const { container } = await renderAttached(handle, workspace);
  typeHours(container, 0, 3);
  await savedStatus(15000);
  const saved = fileData(handle);
  expect(saved.projects).toHaveLength(121);
  expect(saved.projects[0].entries[WEEK]).toEqual({ 0: 3 });
  expect(saved.projects[120].notes.general[weeks[103]]).toEqual({ 0: 'n 119' });
}, 30000);

test('closing the tab with unsaved changes asks first', async () => {
  const handle = controlledHandle('TimeMaster.json');
  handle.state.hold = true;
  const { container } = await renderAttached(handle);
  typeHours(container, 0, 1);
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  releaseHeld(handle);
  await savedStatus();
  const after = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
});

test('a save that starts before React has applied the previous save is not mistaken for an outside change', async () => {
  // The visibility flush (or a debounce timer) can run between a save
  // finishing and React re-rendering, so it still holds the old revision. The
  // file then holds the write that just finished, which is ours.
  const handle = controlledHandle('TimeMaster.json');
  const { container } = await renderAttached(handle);
  handle.state.hold = true;
  typeHours(container, 0, 1);
  await waitFor(() => expect(statusText()).toBe('Saving…'), { timeout: 3000 });
  typeHours(container, 1, 2);
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden',
  });
  try {
    releaseHeld(handle);
    // Let the first save finish (microtasks only), then hide the tab before
    // React has had a task to commit the result.
    for (let i = 0; i < 200; i += 1) await Promise.resolve();
    expect(handle.state.writes).toBe(1);
    document.dispatchEvent(new Event('visibilitychange'));
  } finally {
    delete document.visibilityState;
  }
  await savedStatus();
  expect(fileData(handle).projects[0].entries[WEEK]).toEqual({ 0: 1, 1: 2 });
});
