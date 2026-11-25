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

test('keeps New project open when a drag ends on the backdrop', async () => {
  loadSessionFromIdb.mockResolvedValue(null);
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'New project' }));

  const input = screen.getByRole('textbox', { name: 'Project name' });
  const scrim = input.closest('.scrim');
  fireEvent.change(input, { target: { value: 'Client Dashboard' } });

  // A press that starts in the field and ends on the backdrop is a text
  // selection drag, not a dismissal.
  fireEvent.mouseDown(input);
  fireEvent.mouseUp(scrim);
  fireEvent.click(scrim);
  expect(screen.getByRole('textbox', { name: 'Project name' }).value).toBe(
    'Client Dashboard',
  );
  expect(screen.getByRole('heading', { name: 'New project' })).toBeTruthy();

  fireEvent.mouseDown(scrim);
  expect(screen.queryByRole('heading', { name: 'New project' })).toBeNull();
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

test('the entry popover saves hours and a note together', async () => {
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
  fireEvent.focus(input);
  const dialog = await screen.findByRole('dialog', {
    name: /Note for Audit, General, Monday/,
  });
  fireEvent.blur(input, { target: { value: '1.5' } });
  // Valid hours from the table never open the separate note modal.
  expect(screen.queryByRole('button', { name: 'Save note' })).toBeNull();
  const note = within(dialog).getByRole('textbox', { name: 'Entry note' });
  fireEvent.change(note, { target: { value: 'Reviewed controls' } });
  fireEvent.keyDown(note, { key: 'Enter' });
  const saved = saveSessionToIdb.mock.lastCall[2].projects[0];
  expect(saved.entries[week][0]).toBe(1.5);
  expect(saved.notes.general[week][0]).toBe('Reviewed controls');
  expect(
    within(table)
      .getByRole('textbox', { name: 'Audit, General, Monday' })
      .getAttribute('title'),
  ).toBe('Reviewed controls');

  // Clearing the hours clears the note with them.
  fireEvent.blur(
    within(table).getByRole('textbox', { name: 'Audit, General, Monday' }),
    { target: { value: '' } },
  );
  const cleared = saveSessionToIdb.mock.lastCall[2].projects[0];
  expect(cleared.notes?.general?.[week]?.[0]).toBeUndefined();
});

const auditWeek = '2026-11-16';
const loadAudit = (project = {}) =>
  loadSessionFromIdb.mockResolvedValue({
    weekKey: auditWeek,
    data: {
      schemaVersion: 3,
      projects: [
        { id: 'audit', name: 'Audit', resourcedHours: 8, ...project },
      ],
      settings: {},
    },
  });
const cell = (table, day) =>
  within(table).getByRole('textbox', { name: `Audit, General, ${day}` });

test('Tab from an hours cell always moves to the next cell, never into the note', async () => {
  loadAudit();
  render(<App />);
  const table = await screen.findByRole('table');
  const monday = cell(table, 'Monday');
  monday.focus();
  await screen.findByRole('dialog', { name: /Note for Audit, General, Monday/ });
  // A click used to send Tab into the note, swallowing the next number.
  fireEvent.pointerDown(monday);
  fireEvent.keyDown(monday, { key: 'Tab' });
  expect(document.activeElement).toBe(cell(table, 'Tuesday'));
  expect(monday.getAttribute('aria-expanded')).toBeNull();
  expect(cell(table, 'Tuesday').getAttribute('aria-expanded')).toBe('true');
});

test('ArrowDown reopens a closed entry card straight on its note', async () => {
  loadAudit({ entries: { [auditWeek]: { 0: 2 } } });
  render(<App />);
  const table = await screen.findByRole('table');
  const monday = cell(table, 'Monday');
  monday.focus();
  await screen.findByRole('dialog', { name: /Note for Audit, General, Monday/ });
  // Enter saves and closes the card but leaves focus on the cell.
  fireEvent.keyDown(monday, { key: 'Enter' });
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.keyDown(cell(table, 'Monday'), { key: 'ArrowDown' });
  const dialog = await screen.findByRole('dialog', {
    name: /Note for Audit, General, Monday/,
  });
  expect(document.activeElement).toBe(
    within(dialog).getByRole('textbox', { name: 'Entry note' }),
  );
});

test('a note typed before any hours is kept with a prompt, not dropped', async () => {
  loadAudit();
  render(<App />);
  const table = await screen.findByRole('table');
  cell(table, 'Monday').focus();
  const dialog = await screen.findByRole('dialog', {
    name: /Note for Audit, General, Monday/,
  });
  const note = within(dialog).getByRole('textbox', { name: 'Entry note' });
  fireEvent.change(note, { target: { value: 'Planning' } });
  fireEvent.keyDown(note, { key: 'Enter' });
  expect(within(dialog).getByRole('alert').textContent).toMatch(/Log hours/);
  expect(note.value).toBe('Planning');
  expect(screen.getByRole('dialog')).toBe(dialog);
});

test('typing 0 in a cell clears its hours and note', async () => {
  loadAudit({
    entries: { [auditWeek]: { 0: 2 } },
    notes: { general: { [auditWeek]: { 0: 'Walkthrough' } } },
  });
  render(<App />);
  const table = await screen.findByRole('table');
  expect(cell(table, 'Monday').getAttribute('title')).toBe('Walkthrough');
  fireEvent.blur(cell(table, 'Monday'), { target: { value: '0' } });
  const saved = saveSessionToIdb.mock.lastCall[2].projects[0];
  expect(saved.entries?.[auditWeek]?.[0]).toBeUndefined();
  expect(saved.notes?.general?.[auditWeek]?.[0]).toBeUndefined();
  expect(cell(table, 'Monday').value).toBe('');
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
