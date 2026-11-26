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
// $30k budget, $28k of costings; $25,200 of your usage is 84% of the budget.
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

test('the card shows only your usage: deliverables, then what you used of the budget', () => {
  show();
  const card = screen
    .getByRole('region', { name: 'Northwind deliverables' })
    .closest('li.fin-card');
  const rows = within(
    screen.getByRole('region', { name: 'Northwind deliverables' }),
  ).getAllByRole('listitem');
  expect(
    rows.map((row) => row.querySelector('.fin-lead-name')?.textContent),
  ).toEqual(['Governance framework', 'Policy workshops', 'Adoption reporting']);
  // Over: how far over, a red wash and the part past the costing hatched.
  expect(rows[0].textContent).toContain('$1,860 over');
  expect(rows[0].textContent).toContain(
    '8.7 days · $13,860 used · $12,000 costed · 116%',
  );
  expect(rows[0].classList.contains('is-over')).toBe(true);
  expect(rows[0].querySelector('.fin-bar i.is-past')).toBeTruthy();
  // Under: usage, never what is left.
  expect(rows[1].textContent).toContain('$5,040 used');
  expect(rows[1].textContent).toContain('3.2 days · $9,000 costed · 56%');
  expect(card.textContent).not.toMatch(/left/);
  expect(card.textContent).toContain('$21,840 used of $28,000');
  const own = screen.getByRole('region', { name: 'Northwind project budget' });
  expect(own.textContent).toContain('You’ve used $25,200');
  expect(own.textContent).toContain('84%');
  expect(own.textContent).toContain('15.8 days logged by you');
  // No banner, no history footer line: the chip and sidebar carry the state.
  expect(within(card).queryByRole('note')).toBeNull();
  expect(card.textContent).not.toContain('historical usage');
  expect(card.textContent).toContain('1 deliverable over');
  // The headline strip: four tiles, no rate sub-line, no subtitle.
  expect(screen.queryByText('Remaining budget')).toBeNull();
  expect(screen.getByText('Project budgets to watch')).toBeTruthy();
  expect(screen.queryByText(/× \$210/)).toBeNull();
  expect(screen.queryByText(/projects tracked/)).toBeNull();
});

test('phases show your share of your own time, and an empty card says what to add', () => {
  show({
    projects: [
      {
        ...base,
        id: 'c',
        name: 'Contoso',
        budget: 20000,
        phaseBudgets: { t: 5000 },
        tasks: [
          { id: 'general', name: 'General' },
          { id: 't', name: 'Training' },
        ],
        entries: { [W]: { 0: 7.6 } },
        taskEntries: { t: { [W]: { 1: 7.6, 2: 15.2 } } },
      },
      { ...base, id: 'e', name: 'Empty', budget: 1000, tasks: [] },
    ],
    settings: {
      hourlyRate: 100,
      leaveWeeks: {},
      capacityByDay: [7.6, 7.6, 7.6, 7.6, 7.6, 0, 0],
    },
  });
  const phases = screen.getByRole('region', {
    name: 'Contoso your time by phase',
  });
  expect(phases.textContent).toContain('share of your 4 days');
  const [general, training] = within(phases).getAllByRole('listitem');
  expect(general.textContent).toContain('1 day · $760');
  expect(training.textContent).toContain('3 days · $2,280');
  // The bar is the share of your own time, not the phase budget.
  expect(training.querySelector('.fin-bar i').style.width).toBe('75%');
  const empty = screen
    .getByRole('region', { name: 'Empty project budget' })
    .closest('li.fin-card');
  expect(empty.textContent).toContain('No deliverables or phases yet.');
});

test('the sidebar lists the items themselves, and history lives in the ⋯ menu', () => {
  const onRemoveHistory = vi.fn();
  show({ onRemoveHistory });
  const side = screen.getByRole('complementary', { name: 'Needs attention' });
  expect(side.textContent).toContain('Governance framework$1,860 over');
  expect(side.textContent).toContain('Northwind84% used');
  expect(side.textContent).toContain('Northwind · project budget');
  expect(side.textContent).toContain('Northwind · deliverable');
  expect(side.textContent).not.toMatch(/left/);
  expect(side.textContent).toContain('Presales');
  fireEvent.click(screen.getByRole('button', { name: 'More for Northwind' }));
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Remove “Before TimeMaster”' }),
  );
  expect(onRemoveHistory).toHaveBeenCalledWith('n', 'h');
});

test('every Needs attention project has a ⋯ menu with its Projectworks link', () => {
  const onAddLink = vi.fn();
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  show({
    onAddLink,
    projects: [
      { ...northwind, projectworksUrl: 'https://acme.projectworks.io/p/1' },
      presales,
    ],
  });
  // An untracked project (no budget) still gets the menu.
  fireEvent.click(screen.getByRole('button', { name: 'Options for Presales' }));
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Add Projectworks link…' }),
  );
  expect(onAddLink).toHaveBeenCalledWith(presales);
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Options for Northwind' })[0],
  );
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Open in Projectworks ↗' }),
  );
  expect(open).toHaveBeenCalledWith(
    'https://acme.projectworks.io/p/1',
    '_blank',
    'noopener,noreferrer',
  );
  // The card's ⋯ menu leads with it too.
  fireEvent.click(screen.getByRole('button', { name: 'More for Northwind' }));
  expect(screen.getAllByRole('menuitem')[0].textContent).toBe(
    'Open in Projectworks ↗',
  );
  open.mockRestore();
});

test('costings show their level and other people’s history is ignored', () => {
  show({
    settings: {
      hourlyRate: 210,
      leaveWeeks: {},
      rateLevels: [{ id: 'cert', name: 'Certified', rate: 250 }],
    },
    projects: [
      {
        ...northwind,
        activities: northwind.activities.map((a) =>
          a.id === 'gov' ? { ...a, levelId: 'cert' } : a,
        ),
        historicalUsage: [
          ...northwind.historicalUsage,
          {
            id: 't',
            label: 'Team',
            who: 'others',
            unit: 'money',
            total: 1000,
            phases: {},
            activities: {},
          },
        ],
      },
    ],
  });
  const card = screen
    .getByRole('region', { name: 'Northwind deliverables' })
    .closest('li.fin-card');
  expect(card.querySelector('.fin-level').textContent).toBe('Certified');
  expect(card.textContent).toContain('You’ve used $25,200');
  expect(card.textContent).not.toContain('other people');
  const side = screen.getByRole('complementary', { name: 'Needs attention' });
  expect(side.textContent).toContain('Governance framework · Certified');
  fireEvent.click(screen.getByRole('button', { name: 'More for Northwind' }));
  expect(screen.queryByText('Other people')).toBeNull();
  expect(screen.queryByText(/Remove “Team”/)).toBeNull();
});
