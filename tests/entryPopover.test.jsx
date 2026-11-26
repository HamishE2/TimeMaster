// Entry popover behaviour in the running app: Esc cancels everything done in
// the card, and Fill tops up the whole day even when the timesheet is filtered.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import App from '../src/App.jsx';
import { loadSessionFromIdb, saveSessionToIdb } from '../src/lib/idb.js';
import { weekKeyFor } from '../src/lib/utils.js';

vi.mock('../src/lib/idb.js', () => ({
  loadSessionFromIdb: vi.fn(),
  saveSessionToIdb: vi.fn().mockResolvedValue(undefined),
}));
afterEach(cleanup);

const week = weekKeyFor(new Date());
const session = () => ({
  weekKey: week,
  data: {
    schemaVersion: 3,
    projects: [
      { id: 'a', name: 'Audit', resourcedHours: 8, entries: { [week]: { 0: 2 } } },
      { id: 'b', name: 'Build', resourcedHours: 8, entries: { [week]: { 0: 5 } } },
    ],
    settings: { visibleDays: [0, 1], capacityByDay: [7.6, 7.6], leaveWeeks: {} },
  },
});
const latest = () => saveSessionToIdb.mock.lastCall[0].data;
const cellFor = async (name) =>
  within(await screen.findByRole('table')).getByRole('textbox', { name });

test('Esc in the cell discards a note typed in the card', async () => {
  loadSessionFromIdb.mockResolvedValue(session());
  render(<App />);
  const cell = await cellFor('Audit, General, Monday');
  fireEvent.focus(cell);
  const note = await screen.findByRole('textbox', { name: 'Entry note' });
  fireEvent.change(note, { target: { value: 'draft I meant to cancel' } });
  fireEvent.keyDown(cell, { key: 'Escape' });
  await act(async () => {});
  expect(document.querySelector('.entry-popover')).toBeNull();
  expect(latest().projects[0].notes?.general).toBeUndefined();
});

test('Fill tops up the whole day, not only the projects a search shows', async () => {
  loadSessionFromIdb.mockResolvedValue(session());
  render(<App />);
  await screen.findByRole('table');
  fireEvent.change(screen.getByPlaceholderText('Find a project'), {
    target: { value: 'Audit' },
  });
  fireEvent.focus(await cellFor('Audit, General, Monday'));
  // 7.6 − (2 + 5) = 0.6h left on Monday across both projects.
  const fill = document.querySelector('.fill-pick');
  expect(fill.textContent).toBe('Fill +0.6');
  fireEvent.click(fill);
  await act(async () => {});
  const [audit, build] = latest().projects;
  expect(audit.entries[week][0] + build.entries[week][0]).toBeCloseTo(7.6, 9);
});

test('an entry on a costing that is over shows the Money card’s overage and still saves', async () => {
  const data = session().data;
  data.settings.hourlyRate = 100;
  data.projects[0] = {
    ...data.projects[0],
    budget: 10000,
    activities: [{ id: 'qrg', name: 'QRGs', amount: 500 }],
    entries: { [week]: { 0: 2, 1: 4 } },
    activityTags: { general: { [week]: { 0: 'qrg', 1: 'qrg' } } },
  };
  loadSessionFromIdb.mockResolvedValue({ weekKey: week, data });
  render(<App />);
  // 6h at $100 = $600 against a $500 costing: $100 over, the same as the card.
  fireEvent.focus(await cellFor('Audit, General, Monday'));
  const card = document.querySelector('.entry-popover');
  expect(card.querySelector('.costing-over').textContent).toBe(
    '$100 over this costing',
  );
  // It never blocks saving.
  const note = within(card).getByRole('textbox', { name: 'Entry note' });
  fireEvent.change(note, { target: { value: 'QRG edits' } });
  fireEvent.keyDown(note, { key: 'Enter' });
  await act(async () => {});
  expect(latest().projects[0].notes.general[week][0]).toBe('QRG edits');
});
