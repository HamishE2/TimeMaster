import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import App from '../src/App.jsx';
import { loadSessionFromIdb, saveSessionToIdb } from '../src/lib/idb.js';

vi.mock('../src/lib/idb.js', () => ({
  loadSessionFromIdb: vi.fn(),
  saveSessionToIdb: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('keeps Add project open when a drag ends on the backdrop', async () => {
  loadSessionFromIdb.mockResolvedValue(null);
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'New project' }));

  const input = screen.getByRole('textbox', { name: 'Project name' });
  const backdrop = input.closest('.modal-backdrop');
  fireEvent.change(input, { target: { value: 'Client Dashboard' } });

  // A click from different press and release targets lands on their common ancestor.
  fireEvent.pointerDown(input, { button: 0 });
  fireEvent.pointerUp(backdrop, { button: 0 });
  fireEvent.click(backdrop);

  expect(screen.getByRole('textbox', { name: 'Project name' }).value).toBe(
    'Client Dashboard',
  );

  fireEvent.pointerDown(backdrop, { button: 0 });
  fireEvent.pointerUp(input, { button: 0 });
  fireEvent.click(backdrop);
  expect(screen.getByRole('heading', { name: 'Add project' })).toBeTruthy();

  fireEvent.pointerDown(backdrop, { button: 0 });
  fireEvent.pointerUp(backdrop, { button: 0 });
  fireEvent.click(backdrop);
  expect(screen.queryByRole('heading', { name: 'Add project' })).toBeNull();
});

test('renders General time and two phase lines on desktop and mobile', async () => {
  const week = '2026-07-13';
  const general = { id: 'general', name: 'General' };
  loadSessionFromIdb.mockResolvedValue({
    weekKey: week,
    data: {
      schemaVersion: 3,
      projects: [
        {
          id: 'support',
          name: 'Client Support',
          resourcedHours: 8,
          tasks: [general],
          entries: { [week]: { 0: 2 } },
        },
        {
          id: 'launch',
          name: 'Website Launch',
          resourcedHours: 10,
          tasks: [
            general,
            { id: 'design', name: 'Design' },
            { id: 'build', name: 'Build' },
          ],
          taskEntries: { design: { [week]: { 0: 3 } } },
          taskRows: { [week]: ['build'] },
        },
      ],
      settings: { visibleDays: [0], capacityByDay: [7.6], leaveWeeks: {} },
    },
  });
  const consoleError = vi.spyOn(console, 'error');

  const { container } = render(<App />);

  const table = await screen.findByRole('table');
  const cards = container.querySelector('.mobile-cards');
  const desktop = within(table);
  const mobile = within(cards);
  for (const view of [desktop, mobile]) {
    expect(view.getByRole('button', { name: 'Client Support' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Website Launch' })).toBeTruthy();
    expect(
      view.getByRole('textbox', { name: 'Client Support, General, Monday' })
        .value,
    ).toBe('2');
    expect(
      view.getByRole('textbox', { name: 'Website Launch, Design, Monday' })
        .value,
    ).toBe('3');
    expect(
      view.getByRole('textbox', { name: 'Website Launch, Build, Monday' })
        .value,
    ).toBe('');
    expect(
      view.queryByRole('textbox', { name: 'Website Launch, General, Monday' }),
    ).toBeNull();
  }
  expect(desktop.queryByRole('columnheader', { name: 'Usage' })).toBeNull();
  expect(table.querySelector('.allocation-meter')).toBeNull();
  expect(cards.querySelector('.allocation-meter')).toBeNull();
  expect(container.querySelector('.insights .allocation-meter')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Categorise timesheet'), {
    target: { value: 'status' },
  });
  expect(table.querySelector('.timesheet-group-row')).toBeTruthy();
  const columnCount = table.tHead.rows[0].cells.length;
  for (const row of table.rows) {
    expect(
      [...row.cells].reduce((count, cell) => count + cell.colSpan, 0),
    ).toBe(columnCount);
  }
  expect(consoleError).not.toHaveBeenCalled();
});

test('remembers ledger column widths and queues local edits immediately', async () => {
  const week = '2026-11-16';
  loadSessionFromIdb.mockResolvedValue({
    weekKey: week,
    data: {
      schemaVersion: 3,
      projects: [{ id: 'audit', name: 'Audit', resourcedHours: 8 }],
      settings: {},
    },
  });
  const view = render(<App />);
  const table = await screen.findByRole('table');
  const handle = within(table).getByRole('separator', {
    name: 'Resize Project / task column',
  });
  const before = Number(handle.getAttribute('aria-valuenow'));
  fireEvent.keyDown(handle, { key: 'ArrowRight' });
  expect(Number(handle.getAttribute('aria-valuenow'))).toBe(before + 12);
  const input = within(table).getByRole('textbox', {
    name: 'Audit, General, Monday',
  });
  fireEvent.blur(input, { target: { value: '2.5' } });
  expect(saveSessionToIdb.mock.lastCall[2].projects[0].entries[week][0]).toBe(
    2.5,
  );
  view.unmount();
  render(<App />);
  const restored = within(await screen.findByRole('table')).getByRole(
    'separator',
    { name: 'Resize Project / task column' },
  );
  expect(Number(restored.getAttribute('aria-valuenow'))).toBe(before + 12);
  fireEvent.keyDown(restored, { key: 'Home' });
  expect(Number(restored.getAttribute('aria-valuenow'))).toBe(before);
});

test('asks for a note after logging hours and saves it on the slot', async () => {
  const week = '2026-11-16';
  loadSessionFromIdb.mockResolvedValue({
    weekKey: week,
    data: {
      schemaVersion: 3,
      projects: [{ id: 'audit', name: 'Audit', resourcedHours: 8 }],
      settings: {},
    },
  });
  render(<App />);
  const table = await screen.findByRole('table');
  const input = within(table).getByRole('textbox', {
    name: 'Audit, General, Monday',
  });
  fireEvent.blur(input, { target: { value: '1.5' } });
  const note = await screen.findByRole('textbox', { name: 'Entry note' });
  fireEvent.change(note, { target: { value: 'Reviewed controls' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
  expect(screen.queryByRole('textbox', { name: 'Entry note' })).toBeNull();
  const saved = saveSessionToIdb.mock.lastCall[2].projects[0];
  expect(saved.entries[week][0]).toBe(1.5);
  expect(saved.notes.general[week][0]).toBe('Reviewed controls');
  expect(
    within(table).getByRole('button', {
      name: 'Edit note for Audit, General, Monday: Reviewed controls',
    }),
  ).toBeTruthy();

  // Re-entering the same value does not prompt again.
  fireEvent.blur(
    within(table).getByRole('textbox', { name: 'Audit, General, Monday' }),
    { target: { value: '1.5' } },
  );
  expect(screen.queryByRole('textbox', { name: 'Entry note' })).toBeNull();
});

test('warns once when the attached file handle can no longer be stored', async () => {
  const handle = { name: 'TimeMaster.json' };
  loadSessionFromIdb.mockResolvedValue({
    fileHandle: handle,
    weekKey: '2026-07-13',
    data: { schemaVersion: 3, projects: [], settings: {} },
  });
  saveSessionToIdb.mockResolvedValue({ handleStored: false });
  render(<App />);

  expect(
    await screen.findByText(/can no longer reach TimeMaster\.json/),
  ).toBeTruthy();
  expect(screen.queryByText(/browser copy could not be saved/)).toBeNull();
  saveSessionToIdb.mockResolvedValue(undefined);
});
