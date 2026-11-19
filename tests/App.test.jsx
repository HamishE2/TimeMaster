import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import App from '../src/App.jsx';
import { loadSessionFromIdb } from '../src/lib/idb.js';

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
