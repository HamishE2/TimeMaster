import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import Financials from '../src/components/Financials.jsx';

afterEach(cleanup);

const W = '2026-11-23';
const base = {
  resourcedHours: null,
  entries: {},
  taskEntries: {},
  hiddenWeeks: [],
  weeklyOverrides: {},
  frontloads: {},
};
// $30k budget, $28k of costings; logged time leaves $4,800 against $8,020 of
// costed work still to do.
const northwind = {
  ...base,
  id: 'n',
  name: 'Northwind',
  client: 'Northwind',
  color: '#2f7fb5',
  budget: 30000,
  tasks: [{ id: 'general', name: 'General' }],
  activities: [
    { id: 'gov', name: 'Governance framework', amount: 12000 },
    { id: 'pol', name: 'Policy workshops', amount: 9000 },
    { id: 'rep', name: 'Adoption reporting', amount: 7000 },
  ],
  historicalUsage: [
    {
      id: 'h',
      label: 'Before TimeMaster',
      asOf: '2026-11-20',
      unit: 'money',
      total: 25200,
      phases: {},
      activities: { gov: 13860, pol: 5040, rep: 2940 },
    },
  ],
};
const presales = { ...base, id: 'p', name: 'Presales', tasks: [] };

const show = (props = {}) =>
  render(
    <Financials
      projects={[northwind, presales]}
      settings={{ hourlyRate: 210, leaveWeeks: {} }}
      week={W}
      days={[0, 1, 2, 3, 4]}
      onOpenSettings={() => {}}
      onEditProject={() => {}}
      onNewProject={() => {}}
      onTag={() => {}}
      onSaveHistory={() => {}}
      onRemoveHistory={() => {}}
      {...props}
    />,
  );

test('the card leads with a bar per costing and flags a low project budget', () => {
  show();
  const card = screen
    .getByRole('region', { name: 'Northwind costings' })
    .closest('li.fin-card');
  const rows = within(card).getAllByRole('listitem');
  expect(
    rows.map((row) => row.querySelector('.fin-lead-name')?.textContent),
  ).toEqual(['Governance framework', 'Policy workshops', 'Adoption reporting']);
  expect(rows[0].textContent).toContain('$1,860 over');
  expect(rows[1].textContent).toContain('$3,960 left');
  expect(within(card).getByRole('note').textContent).toMatch(
    /Project budget low.*\$4,800 left, but \$8,020 of costed work/,
  );
  expect(card.textContent).toContain('1 costing over');
  expect(card.textContent).toContain('Includes $25,200 historical usage');
  // No portfolio totals in the headline strip.
  expect(screen.queryByText('Remaining budget')).toBeNull();
  expect(screen.getByText('Low project budgets')).toBeTruthy();
});

test('the sidebar lists the items themselves, and history lives in the ⋯ menu', () => {
  const onRemoveHistory = vi.fn();
  show({ onRemoveHistory });
  const side = screen.getByRole('complementary', { name: 'Needs attention' });
  expect(side.textContent).toContain('Governance framework');
  expect(side.textContent).toContain('Project budget low');
  expect(side.textContent).toContain('Presales');
  fireEvent.click(screen.getByRole('button', { name: 'More for Northwind' }));
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Remove “Before TimeMaster”' }),
  );
  expect(onRemoveHistory).toHaveBeenCalledWith('n', 'h');
});
