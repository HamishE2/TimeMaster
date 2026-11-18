import { cleanup, render, screen, within } from '@testing-library/react';
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

  const desktop = within(await screen.findByRole('table'));
  const mobile = within(container.querySelector('.mobile-cards'));
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
  expect(consoleError).not.toHaveBeenCalled();
});
